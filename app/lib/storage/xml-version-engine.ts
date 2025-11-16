import { diff_match_patch } from "diff-match-patch";
import {
  ZERO_SOURCE_VERSION_ID,
  DIFF_KEYFRAME_THRESHOLD,
  MAX_DIFF_CHAIN_LENGTH,
  WIP_VERSION,
} from "./constants";
import type { XMLVersion } from "./types";

type DiffEngine = InstanceType<typeof diff_match_patch>;

export type VersionResolver = (id: string) => Promise<XMLVersion | null>;

export interface VersionPayloadResult {
  xml_content: string;
  is_keyframe: boolean;
  diff_chain_depth: number;
  source_version_id: string;
}

const createDiffEngine = (): DiffEngine => {
  const engine = new diff_match_patch();
  engine.Diff_Timeout = 1;
  return engine;
};

/**
 * 计算新版本的持久化策略（关键帧 vs Diff）
 * 如果与最新版本内容一致，则返回 null 表示无需创建新版本
 * WIP 版本始终返回关键帧 payload，即使内容相同
 */
export async function computeVersionPayload({
  newXml,
  semanticVersion,
  latestVersion,
  resolveVersionById,
}: {
  newXml: string;
  semanticVersion: string;
  latestVersion: XMLVersion | null;
  resolveVersionById: VersionResolver;
}): Promise<VersionPayloadResult | null> {
  // WIP 版本始终为关键帧（全量存储），允许相同内容更新
  if (semanticVersion === WIP_VERSION) {
    return {
      xml_content: newXml,
      is_keyframe: true,
      diff_chain_depth: 0,
      source_version_id: ZERO_SOURCE_VERSION_ID,
    };
  }

  // WIP 版本是独立草稿，不应作为其他版本的 diff 链基础
  const effectiveLatestVersion =
    latestVersion?.semantic_version === WIP_VERSION ? null : latestVersion;

  // 历史版本：使用关键帧 + Diff 混合策略
  if (!effectiveLatestVersion) {
    return {
      xml_content: newXml,
      is_keyframe: true,
      diff_chain_depth: 0,
      source_version_id: ZERO_SOURCE_VERSION_ID,
    };
  }

  const baseXml = await materializeVersionXml(
    effectiveLatestVersion,
    resolveVersionById,
  );
  if (baseXml === newXml) {
    return null;
  }

  const diffEngine = createDiffEngine();
  const diffs = diffEngine.diff_main(baseXml, newXml);
  diffEngine.diff_cleanupSemantic(diffs);

  const changedCharacters = diffs.reduce((count, diff) => {
    const [operation, text] = diff;
    return operation === 0 ? count : count + text.length;
  }, 0);
  const baseline = Math.max(baseXml.length, 1);
  const changeRatio = changedCharacters / baseline;

  const nextDepth = effectiveLatestVersion.is_keyframe
    ? 1
    : effectiveLatestVersion.diff_chain_depth + 1;

  const needsKeyframe =
    changeRatio > DIFF_KEYFRAME_THRESHOLD || nextDepth > MAX_DIFF_CHAIN_LENGTH;

  if (needsKeyframe) {
    return {
      xml_content: newXml,
      is_keyframe: true,
      diff_chain_depth: 0,
      source_version_id: ZERO_SOURCE_VERSION_ID,
    };
  }

  const patches = diffEngine.patch_make(baseXml, newXml);
  const patchText = diffEngine.patch_toText(patches);

  return {
    xml_content: patchText,
    is_keyframe: false,
    diff_chain_depth: nextDepth,
    source_version_id: effectiveLatestVersion.id,
  };
}

/**
 * 将任意版本恢复为完整 XML
 */
export async function materializeVersionXml(
  version: XMLVersion,
  resolveVersionById: VersionResolver,
  cache: Map<string, string> = new Map(),
): Promise<string> {
  const diffEngine = createDiffEngine();
  return resolveMaterializedXml(version, resolveVersionById, cache, diffEngine);
}

async function resolveMaterializedXml(
  version: XMLVersion,
  resolveVersionById: VersionResolver,
  cache: Map<string, string>,
  diffEngine: DiffEngine,
): Promise<string> {
  const cached = cache.get(version.id);
  if (cached) {
    return cached;
  }

  if (version.is_keyframe) {
    cache.set(version.id, version.xml_content);
    return version.xml_content;
  }

  if (version.source_version_id === ZERO_SOURCE_VERSION_ID) {
    throw new Error(
      `版本 ${version.id} 标记为 Diff，但缺少有效的 source_version_id`,
    );
  }

  const parent = await resolveVersionById(version.source_version_id);
  if (!parent) {
    throw new Error(
      `无法加载源版本: ${version.source_version_id}（当前: ${version.id}）`,
    );
  }

  const baseXml = await resolveMaterializedXml(
    parent,
    resolveVersionById,
    cache,
    diffEngine,
  );

  const patches = diffEngine.patch_fromText(version.xml_content);
  const [result, applied] = diffEngine.patch_apply(patches, baseXml);
  if (applied.some((flag: boolean) => !flag)) {
    console.warn("[XMLVersion] Diff 应用异常", {
      versionId: version.id,
      sourceVersionId: version.source_version_id,
    });
  }

  cache.set(version.id, result);
  return result;
}

import { v4 as uuidv4 } from "uuid";

import { getStorage } from "./storage-factory";
import { WIP_VERSION } from "./constants";
import { buildPageMetadataFromXml } from "./page-metadata";
import { computeVersionPayload } from "./xml-version-engine";
import type { XMLVersion } from "./types";
import { normalizeDiagramXml } from "../drawio-xml-utils";
import { getParentVersion, isSubVersion } from "../version-utils";

export interface XmlContext {
  normalizedXml: string;
  pageMetadata: ReturnType<typeof buildPageMetadataFromXml>;
  pageNamesJson: string;
}

export interface PersistWipOptions {
  previewImage?: Blob | Buffer;
  name?: string;
  description?: string;
  timestamp?: number;
}

export interface PersistHistoricalOptions {
  description?: string;
  previewSvg?: Blob | Buffer;
  pagesSvg?: Blob | Buffer;
  pageNamesOverride?: string[] | null;
}

function dispatchVersionEvent(
  event: "version-updated" | "wip-updated",
  projectUuid: string,
  versionId?: string,
) {
  if (typeof window === "undefined") return;
  const detail = { projectUuid, versionId };
  window.dispatchEvent(new CustomEvent(event, { detail }));
}

export function prepareXmlContext(xml: string): XmlContext {
  const normalizedXml = normalizeDiagramXml(xml);
  const pageMetadata = buildPageMetadataFromXml(normalizedXml);
  return {
    normalizedXml,
    pageMetadata,
    pageNamesJson: JSON.stringify(pageMetadata.pageNames),
  };
}

export async function persistWipVersion(
  projectUuid: string,
  xmlOrContext: string | XmlContext,
  options?: PersistWipOptions,
): Promise<{ versionId: string; context: XmlContext }> {
  const storage = await getStorage();
  const project = await storage.getProject(projectUuid);

  if (!project) {
    throw new Error(
      `当前项目不存在 (UUID: ${projectUuid})，请检查项目设置或重新选择项目`,
    );
  }

  const context =
    typeof xmlOrContext === "string"
      ? prepareXmlContext(xmlOrContext)
      : xmlOrContext;
  const payload = await computeVersionPayload({
    newXml: context.normalizedXml,
    semanticVersion: WIP_VERSION,
    baseVersion: null,
    resolveVersionById: (id) => storage.getXMLVersion(id, projectUuid),
  });

  if (!payload) {
    throw new Error("无法计算 WIP 版本数据");
  }

  const existingVersions = await storage.getXMLVersionsByProject(projectUuid);
  const wipVersion = existingVersions.find(
    (version) => version.semantic_version === WIP_VERSION,
  );
  const timestamp = options?.timestamp ?? Date.now();

  if (wipVersion) {
    await storage.updateXMLVersion(wipVersion.id, {
      project_uuid: projectUuid,
      semantic_version: WIP_VERSION,
      xml_content: payload.xml_content,
      source_version_id: payload.source_version_id,
      is_keyframe: payload.is_keyframe,
      diff_chain_depth: payload.diff_chain_depth,
      metadata: null,
      page_count: context.pageMetadata.pageCount,
      page_names: context.pageNamesJson,
      preview_image: options?.previewImage,
      name: options?.name ?? "WIP",
      description: options?.description ?? "活跃工作区",
      created_at: timestamp,
    });
    dispatchVersionEvent("wip-updated", projectUuid, wipVersion.id);
    return { versionId: wipVersion.id, context };
  }

  const newVersion = await storage.createXMLVersion({
    id: uuidv4(),
    project_uuid: projectUuid,
    semantic_version: WIP_VERSION,
    xml_content: payload.xml_content,
    source_version_id: payload.source_version_id,
    is_keyframe: payload.is_keyframe,
    diff_chain_depth: payload.diff_chain_depth,
    metadata: null,
    page_count: context.pageMetadata.pageCount,
    page_names: context.pageNamesJson,
    preview_image: options?.previewImage,
    name: options?.name ?? "WIP",
    description: options?.description ?? "活跃工作区",
  });

  dispatchVersionEvent("wip-updated", projectUuid, newVersion.id);
  return { versionId: newVersion.id, context };
}

async function resolveBaseVersion(
  storage: Awaited<ReturnType<typeof getStorage>>,
  projectUuid: string,
  semanticVersion: string,
): Promise<XMLVersion | null> {
  const versions = await storage.getXMLVersionsByProject(projectUuid);
  const historicalVersions = versions
    .filter((v) => v.semantic_version !== WIP_VERSION)
    .sort((a, b) => b.created_at - a.created_at);

  if (isSubVersion(semanticVersion)) {
    const parentVersion = getParentVersion(semanticVersion);
    const parent = historicalVersions.find(
      (v) => v.semantic_version === parentVersion,
    );
    if (!parent) {
      throw new Error(
        `无法创建子版本 ${semanticVersion}：父版本 ${parentVersion} 不存在，请先创建主版本或刷新列表`,
      );
    }
    return parent;
  }

  return historicalVersions[0] ?? null;
}

export async function persistHistoricalVersion(
  projectUuid: string,
  xmlOrContext: string | XmlContext,
  semanticVersion: string,
  options?: PersistHistoricalOptions,
): Promise<{
  versionId: string;
  pageCount: number;
  context: XmlContext;
  baseVersionId: string | null;
}> {
  const storage = await getStorage();
  const context =
    typeof xmlOrContext === "string"
      ? prepareXmlContext(xmlOrContext)
      : xmlOrContext;
  const baseVersion = await resolveBaseVersion(
    storage,
    projectUuid,
    semanticVersion,
  );

  const payload = await computeVersionPayload({
    newXml: context.normalizedXml,
    semanticVersion,
    baseVersion,
    resolveVersionById: (id) => storage.getXMLVersion(id, projectUuid),
  });

  if (!payload) {
    throw new Error("无法计算历史版本数据");
  }

  const finalPageNames = options?.pageNamesOverride ?? context.pageMetadata.pageNames;
  const finalPageCount = finalPageNames?.length ?? context.pageMetadata.pageCount;

  if (!finalPageCount || finalPageCount < 1) {
    throw new Error("未能解析到有效的页面数据，无法创建版本");
  }

  const newVersion = await storage.createXMLVersion({
    id: uuidv4(),
    project_uuid: projectUuid,
    semantic_version: semanticVersion,
    xml_content: payload.xml_content,
    preview_image: undefined,
    preview_svg: options?.previewSvg,
    pages_svg: options?.pagesSvg,
    name: semanticVersion,
    description: options?.description,
    metadata: null,
    is_keyframe: payload.is_keyframe,
    diff_chain_depth: payload.diff_chain_depth,
    source_version_id: payload.source_version_id,
    page_count: finalPageCount,
    page_names: JSON.stringify(finalPageNames ?? []),
  });

  dispatchVersionEvent("version-updated", projectUuid, newVersion.id);

  return {
    versionId: newVersion.id,
    pageCount: finalPageCount,
    context,
    baseVersionId: baseVersion?.id ?? null,
  };
}

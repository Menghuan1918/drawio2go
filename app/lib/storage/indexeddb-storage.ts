import {
  openDB,
  type IDBPDatabase,
  type IDBPObjectStore,
  type IDBPTransaction,
} from "idb";
import type { StorageAdapter } from "./adapter";
import type {
  Setting,
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  XMLVersion,
  XMLVersionSVGData,
  CreateXMLVersionInput,
  Conversation,
  CreateConversationInput,
  UpdateConversationInput,
  Message,
  CreateMessageInput,
} from "./types";
import {
  DB_NAME,
  DB_VERSION,
  DEFAULT_PROJECT_UUID,
  WIP_VERSION,
  ZERO_SOURCE_VERSION_ID,
} from "./constants";
import {
  assertValidSvgBinary,
  resolvePageMetadataFromXml,
} from "./page-metadata-validators";
import { runIndexedDbMigrations } from "./migrations/indexeddb";
import { v4 as uuidv4 } from "uuid";
import { createDefaultDiagramXml } from "./default-diagram-xml";

type ConversationEventType =
  | "conversation-created"
  | "conversation-updated"
  | "conversation-deleted"
  | "messages-updated";

function dispatchConversationEvent(
  event: ConversationEventType,
  detail: {
    projectUuid?: string;
    conversationId?: string;
    conversationIds?: string[];
    messageIds?: string[];
  },
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(event, { detail }));
}

/**
 * IndexedDB 存储实现（Web 环境）
 * 使用 idb 库提供 Promise 化的 IndexedDB API
 */
export class IndexedDBStorage implements StorageAdapter {
  private db: IDBPDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  private hasSequenceIndex<Mode extends IDBTransactionMode>(
    store: IDBPObjectStore<unknown, ["messages"], "messages", Mode>,
  ): boolean {
    const names = store.indexNames;
    if (!names) return false;
    if (typeof (names as DOMStringList).contains === "function") {
      return (names as DOMStringList).contains(
        "conversation_id_sequence_number",
      );
    }
    for (let i = 0; i < names.length; i += 1) {
      if (names[i] === "conversation_id_sequence_number") {
        return true;
      }
    }
    return false;
  }

  private async ensureSequenceFloor(
    tx: IDBPTransaction<unknown, string[], "readwrite">,
    conversationId: string,
    targetSequence: number,
  ): Promise<void> {
    const seqStore = tx.objectStore("conversation_sequences");
    const existing = await seqStore.get(conversationId);
    const current = existing?.last_sequence ?? 0;
    if (targetSequence > current) {
      await seqStore.put({
        conversation_id: conversationId,
        last_sequence: targetSequence,
      });
    }
  }

  private async getNextSequence(
    tx: IDBPTransaction<unknown, string[], "readwrite">,
    conversationId: string,
  ): Promise<number> {
    const seqStore = tx.objectStore("conversation_sequences");
    const existing = await seqStore.get(conversationId);
    const nextSeq = (existing?.last_sequence || 0) + 1;
    await seqStore.put({
      conversation_id: conversationId,
      last_sequence: nextSeq,
    });
    return nextSeq;
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    // 避免重复初始化
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      this.db = await openDB(DB_NAME, DB_VERSION, {
        upgrade: async (db, oldVersion, newVersion, transaction) => {
          console.log(
            `Upgrading IndexedDB from ${oldVersion} to ${newVersion}`,
          );
          await runIndexedDbMigrations(db, oldVersion, newVersion, transaction);
        },
      });

      // 确保默认工程存在
      await this._ensureDefaultProject();
      await this._ensureDefaultWipVersion();

      console.log("IndexedDB initialized");
    } catch (error) {
      console.error("Failed to initialize IndexedDB:", error);
      throw error;
    }
  }

  /**
   * 确保数据库已初始化
   */
  private async ensureDB(): Promise<IDBPDatabase> {
    if (!this.db) {
      await this.initialize();
    }
    return this.db!;
  }

  /**
   * 确保默认工程存在
   */
  private async _ensureDefaultProject(): Promise<void> {
    const db = await this.ensureDB();
    const existing = await db.get("projects", DEFAULT_PROJECT_UUID);

    if (!existing) {
      const now = Date.now();
      const defaultProject: Project = {
        uuid: DEFAULT_PROJECT_UUID,
        name: "Default Project",
        description: "默认工程",
        created_at: now,
        updated_at: now,
      };

      await db.put("projects", defaultProject);
      console.log("Created default project");
    }
  }

  /**
   * 确保默认 WIP 版本存在（避免首次访问空库触发 AI 工具失败）
   */
  private async _ensureDefaultWipVersion(): Promise<void> {
    const versions = await this.getXMLVersionsByProject(DEFAULT_PROJECT_UUID);
    if (versions.length > 0) {
      return;
    }

    const defaultXml = createDefaultDiagramXml();
    const { pageCount, pageNamesJson } = resolvePageMetadataFromXml({
      xmlContent: defaultXml,
    });

    await this.createXMLVersion({
      id: uuidv4(),
      project_uuid: DEFAULT_PROJECT_UUID,
      semantic_version: WIP_VERSION,
      source_version_id: ZERO_SOURCE_VERSION_ID,
      is_keyframe: true,
      diff_chain_depth: 0,
      xml_content: defaultXml,
      metadata: null,
      page_count: pageCount,
      page_names: pageNamesJson,
      preview_svg: undefined,
      pages_svg: undefined,
      preview_image: undefined,
      description: "默认工作版本",
      name: undefined,
    });
  }

  // ==================== Settings ====================

  async getSetting(key: string): Promise<string | null> {
    const db = await this.ensureDB();
    const setting = await db.get("settings", key);
    return setting ? setting.value : null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const db = await this.ensureDB();
    const now = Date.now();
    await db.put("settings", { key, value, updated_at: now });
  }

  async deleteSetting(key: string): Promise<void> {
    const db = await this.ensureDB();
    await db.delete("settings", key);
  }

  async getAllSettings(): Promise<Setting[]> {
    const db = await this.ensureDB();
    return db.getAll("settings");
  }

  // ==================== Projects ====================

  async getProject(uuid: string): Promise<Project | null> {
    const db = await this.ensureDB();
    const project = await db.get("projects", uuid);
    return project || null;
  }

  async createProject(project: CreateProjectInput): Promise<Project> {
    const db = await this.ensureDB();
    const now = Date.now();
    const fullProject: Project = {
      ...project,
      created_at: now,
      updated_at: now,
    };

    await db.put("projects", fullProject);
    return fullProject;
  }

  async updateProject(
    uuid: string,
    updates: UpdateProjectInput,
  ): Promise<void> {
    const db = await this.ensureDB();
    const existing = await db.get("projects", uuid);

    if (!existing) {
      throw new Error(`Project not found: ${uuid}`);
    }

    const now = Date.now();
    const updated: Project = {
      ...existing,
      ...updates,
      updated_at: now,
    };

    await db.put("projects", updated);
  }

  async deleteProject(uuid: string): Promise<void> {
    const db = await this.ensureDB();

    // 级联删除相关数据
    const tx = db.transaction(
      [
        "projects",
        "xml_versions",
        "conversations",
        "messages",
        "conversation_sequences",
      ],
      "readwrite",
    );

    // 删除工程的 XML 版本
    const xmlVersions = await tx
      .objectStore("xml_versions")
      .index("project_uuid")
      .getAll(uuid);
    for (const version of xmlVersions) {
      await tx.objectStore("xml_versions").delete(version.id);
    }

    // 删除工程的对话
    const conversations = await tx
      .objectStore("conversations")
      .index("project_uuid")
      .getAll(uuid);
    for (const conv of conversations) {
      // 删除对话的消息
      const messages = await tx
        .objectStore("messages")
        .index("conversation_id")
        .getAll(conv.id);
      for (const msg of messages) {
        await tx.objectStore("messages").delete(msg.id);
      }
      await tx.objectStore("conversations").delete(conv.id);
      await tx.objectStore("conversation_sequences").delete(conv.id);
    }

    // 删除工程
    await tx.objectStore("projects").delete(uuid);

    await tx.done;
  }

  async getAllProjects(): Promise<Project[]> {
    const db = await this.ensureDB();
    const projects = await db.getAll("projects");
    // 按创建时间倒序
    return projects.sort((a, b) => b.created_at - a.created_at);
  }

  // ==================== XMLVersions ====================

  async getXMLVersion(
    id: string,
    projectUuid?: string,
  ): Promise<XMLVersion | null> {
    const db = await this.ensureDB();
    const version = await db.get("xml_versions", id);

    if (!version) {
      return null;
    }

    if (projectUuid && version.project_uuid !== projectUuid) {
      const message =
        `安全错误：版本 ${id} 不属于当前项目 ${projectUuid}。` +
        `该版本属于项目 ${version.project_uuid}，已拒绝访问。`;
      console.error("[IndexedDBStorage] 拒绝跨项目访问", {
        versionId: id,
        requestedProject: projectUuid,
        versionProject: version.project_uuid,
      });
      throw new Error(message);
    }

    return version;
  }

  async createXMLVersion(version: CreateXMLVersionInput): Promise<XMLVersion> {
    const db = await this.ensureDB();
    const now = Date.now();

    const { pageCount, pageNamesJson } = resolvePageMetadataFromXml({
      xmlContent: version.xml_content,
      userPageCount: version.page_count,
      userPageNames: version.page_names,
    });

    assertValidSvgBinary(version.preview_svg as Blob, "preview_svg");
    assertValidSvgBinary(version.pages_svg as Blob, "pages_svg");

    const fullVersion: XMLVersion = {
      ...version,
      page_count: pageCount,
      page_names: pageNamesJson,
      created_at: now,
    };

    await db.put("xml_versions", fullVersion);
    return fullVersion;
  }

  async getXMLVersionsByProject(projectUuid: string): Promise<XMLVersion[]> {
    const db = await this.ensureDB();
    const versions = await db.getAllFromIndex(
      "xml_versions",
      "project_uuid",
      projectUuid,
    );
    // 按创建时间倒序，移除大字段
    return versions
      .map((version) => {
        const {
          preview_svg: _ignoredPreview,
          pages_svg: _ignoredPages,
          ...rest
        } = version as XMLVersion;
        return rest as XMLVersion;
      })
      .sort((a, b) => b.created_at - a.created_at);
  }

  async getXMLVersionSVGData(
    id: string,
    projectUuid?: string,
  ): Promise<XMLVersionSVGData | null> {
    const db = await this.ensureDB();
    const version = await db.get("xml_versions", id);
    if (!version) {
      return null;
    }

    if (projectUuid && version.project_uuid !== projectUuid) {
      const message =
        `安全错误：版本 ${id} 不属于当前项目 ${projectUuid}。` +
        `该版本属于项目 ${version.project_uuid}，已拒绝访问 SVG 数据。`;
      console.error("[IndexedDBStorage] 拒绝跨项目 SVG 访问", {
        versionId: id,
        requestedProject: projectUuid,
        versionProject: version.project_uuid,
      });
      throw new Error(message);
    }

    return {
      id: version.id,
      project_uuid: version.project_uuid,
      preview_svg: version.preview_svg ?? null,
      pages_svg: version.pages_svg ?? null,
    };
  }

  async updateXMLVersion(
    id: string,
    updates: Partial<Omit<XMLVersion, "id">>,
  ): Promise<void> {
    const db = await this.ensureDB();
    const existing = await db.get("xml_versions", id);

    if (!existing) {
      throw new Error(`XML Version not found: ${id}`);
    }

    const targetSemanticVersion =
      updates.semantic_version ?? existing.semantic_version;

    const nextXml = updates.xml_content ?? (existing as XMLVersion).xml_content;
    const { pageCount, pageNamesJson } = resolvePageMetadataFromXml({
      xmlContent: nextXml,
      userPageCount: updates.page_count,
      userPageNames: updates.page_names,
    });

    assertValidSvgBinary(updates.preview_svg as Blob, "preview_svg");
    assertValidSvgBinary(updates.pages_svg as Blob, "pages_svg");

    const updated: XMLVersion = {
      ...existing,
      ...updates,
      page_count: pageCount,
      page_names: pageNamesJson,
      id: existing.id, // 确保 id 不被覆盖
      created_at:
        updates.created_at ??
        (targetSemanticVersion === WIP_VERSION
          ? Date.now()
          : existing.created_at),
    };

    await db.put("xml_versions", updated);
  }

  async deleteXMLVersion(id: string, projectUuid?: string): Promise<void> {
    const db = await this.ensureDB();

    const existing = await db.get("xml_versions", id);
    if (!existing) {
      return;
    }

    if (projectUuid && existing.project_uuid !== projectUuid) {
      const message = `安全错误：删除版本 ${id} 被拒绝，目标项目 ${projectUuid} 与版本归属 ${existing.project_uuid} 不一致。`;
      console.error("[IndexedDBStorage] 拒绝跨项目删除", {
        versionId: id,
        requestedProject: projectUuid,
        versionProject: existing.project_uuid,
      });
      throw new Error(message);
    }

    // 删除 XML 版本（消息中的 xml_version_id 会被设置为 null）
    const tx = db.transaction(["xml_versions", "messages"], "readwrite");

    // 将关联消息的 xml_version_id 设置为 undefined
    const messages = await tx
      .objectStore("messages")
      .index("xml_version_id")
      .getAll(id);

    for (const msg of messages) {
      const updated = { ...msg, xml_version_id: undefined };
      await tx.objectStore("messages").put(updated);
    }

    // 删除 XML 版本
    await tx.objectStore("xml_versions").delete(id);

    await tx.done;
  }

  // ==================== Conversations ====================

  async getConversation(id: string): Promise<Conversation | null> {
    const db = await this.ensureDB();
    const conversation = await db.get("conversations", id);
    return conversation || null;
  }

  async createConversation(
    conversation: CreateConversationInput,
  ): Promise<Conversation> {
    const db = await this.ensureDB();
    const now = Date.now();
    const fullConversation: Conversation = {
      ...conversation,
      created_at: now,
      updated_at: now,
    };

    await db.put("conversations", fullConversation);
    dispatchConversationEvent("conversation-created", {
      projectUuid: fullConversation.project_uuid,
      conversationId: fullConversation.id,
    });
    return fullConversation;
  }

  async updateConversation(
    id: string,
    updates: UpdateConversationInput,
  ): Promise<void> {
    const db = await this.ensureDB();
    const existing = await db.get("conversations", id);

    if (!existing) {
      throw new Error(`Conversation not found: ${id}`);
    }

    const now = Date.now();
    const updated: Conversation = {
      ...existing,
      ...updates,
      updated_at: now,
    };

    await db.put("conversations", updated);
    dispatchConversationEvent("conversation-updated", {
      projectUuid: updated.project_uuid,
      conversationId: updated.id,
    });
  }

  async deleteConversation(id: string): Promise<void> {
    const db = await this.ensureDB();
    const conversation = await db.get("conversations", id);

    // 级联删除消息
    const tx = db.transaction(
      ["conversations", "messages", "conversation_sequences"],
      "readwrite",
    );

    const messages = await tx
      .objectStore("messages")
      .index("conversation_id")
      .getAll(id);
    for (const msg of messages) {
      await tx.objectStore("messages").delete(msg.id);
    }

    await tx.objectStore("conversations").delete(id);
    await tx.objectStore("conversation_sequences").delete(id);

    await tx.done;

    dispatchConversationEvent("conversation-deleted", {
      projectUuid: conversation?.project_uuid,
      conversationId: id,
    });
    dispatchConversationEvent("messages-updated", {
      projectUuid: conversation?.project_uuid,
      conversationId: id,
    });
  }

  async batchDeleteConversations(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    const db = await this.ensureDB();
    const tx = db.transaction(
      ["conversations", "messages", "conversation_sequences"],
      "readwrite",
    );
    const messagesStore = tx.objectStore("messages");
    const convStore = tx.objectStore("conversations");
    const seqStore = tx.objectStore("conversation_sequences");
    const conversationProjects = new Map<string, string | undefined>();

    for (const id of ids) {
      const conversation = await convStore.get(id);
      conversationProjects.set(id, conversation?.project_uuid);

      const range = IDBKeyRange.only(id);
      const cursor = await messagesStore
        .index("conversation_id")
        .openCursor(range);
      if (cursor) {
        let current: typeof cursor | null = cursor;
        // 逐个删除，兼顾旧环境不支持 delete(range)
        while (current) {
          await messagesStore.delete(current.primaryKey);
          current = await current.continue();
        }
      }
      await convStore.delete(id);
      await seqStore.delete(id);
    }

    await tx.done;

    ids.forEach((conversationId) => {
      dispatchConversationEvent("conversation-deleted", {
        projectUuid: conversationProjects.get(conversationId),
        conversationId,
        conversationIds: ids,
      });
      dispatchConversationEvent("messages-updated", {
        projectUuid: conversationProjects.get(conversationId),
        conversationId,
        conversationIds: ids,
      });
    });
  }

  async exportConversations(ids: string[]): Promise<Blob> {
    const db = await this.ensureDB();
    const tx = db.transaction(["conversations", "messages"], "readonly");
    const convStore = tx.objectStore("conversations");
    const msgStore = tx.objectStore("messages");
    const exportItems = [];

    for (const id of ids) {
      const conv = await convStore.get(id);
      if (!conv) continue;

      const messages = (await msgStore
        .index("conversation_id")
        .getAll(id)) as Message[];

      messages.sort((a, b) => {
        const aSeq =
          typeof a.sequence_number === "number"
            ? a.sequence_number
            : a.created_at;
        const bSeq =
          typeof b.sequence_number === "number"
            ? b.sequence_number
            : b.created_at;
        if (aSeq !== bSeq) return aSeq - bSeq;
        return a.created_at - b.created_at;
      });

      exportItems.push({
        ...conv,
        messages,
      });
    }

    await tx.done;

    const payload = {
      version: "1.1",
      exportedAt: new Date().toISOString(),
      conversations: exportItems,
    };

    return new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
  }

  async getConversationsByProject(
    projectUuid: string,
  ): Promise<Conversation[]> {
    const db = await this.ensureDB();
    const conversations = await db.getAllFromIndex(
      "conversations",
      "project_uuid",
      projectUuid,
    );
    // 按更新时间倒序
    return conversations.sort((a, b) => b.updated_at - a.updated_at);
  }

  // ==================== Messages ====================

  async getMessagesByConversation(conversationId: string): Promise<Message[]> {
    const db = await this.ensureDB();
    const tx = db.transaction("messages", "readonly");
    const store = tx.objectStore("messages");
    const hasSequenceIndex = this.hasSequenceIndex(store);

    let messages: Message[] = [];

    if (hasSequenceIndex) {
      const range = IDBKeyRange.bound(
        [conversationId, -Infinity],
        [conversationId, Infinity],
      );
      const ordered = (await store
        .index("conversation_id_sequence_number")
        .getAll(range)) as Message[];
      const fallback = (await store
        .index("conversation_id")
        .getAll(conversationId)) as Message[];

      const merged = new Map<string, Message>();
      for (const msg of ordered) {
        merged.set(msg.id, msg);
      }
      for (const msg of fallback) {
        merged.set(msg.id, msg);
      }

      messages = Array.from(merged.values());
    } else {
      messages =
        ((await store
          .index("conversation_id")
          .getAll(conversationId)) as Message[]) || [];
    }

    await tx.done;

    return messages.sort((a, b) => {
      const aSeq =
        typeof a.sequence_number === "number"
          ? a.sequence_number
          : a.created_at;
      const bSeq =
        typeof b.sequence_number === "number"
          ? b.sequence_number
          : b.created_at;

      if (aSeq !== bSeq) return aSeq - bSeq;
      return a.created_at - b.created_at;
    });
  }

  async createMessage(message: CreateMessageInput): Promise<Message> {
    const db = await this.ensureDB();
    const tx = db.transaction(
      ["messages", "conversation_sequences"],
      "readwrite",
    );
    const store = tx.objectStore("messages");
    const defaultTimestamp = Date.now();

    const createdAt =
      typeof message.created_at === "number"
        ? message.created_at
        : typeof message.createdAt === "number"
          ? message.createdAt
          : defaultTimestamp;

    const sequenceNumber =
      typeof message.sequence_number === "number"
        ? message.sequence_number
        : await this.getNextSequence(tx, message.conversation_id);

    if (typeof message.sequence_number === "number") {
      await this.ensureSequenceFloor(
        tx,
        message.conversation_id,
        sequenceNumber,
      );
    }

    const fullMessage: Message = {
      id: message.id,
      conversation_id: message.conversation_id,
      role: message.role,
      parts_structure: message.parts_structure,
      model_name: message.model_name ?? null,
      xml_version_id: message.xml_version_id,
      sequence_number: sequenceNumber,
      created_at: createdAt,
    };

    await store.put(fullMessage);
    await tx.done;

    const conversation = await db.get("conversations", message.conversation_id);
    dispatchConversationEvent("messages-updated", {
      projectUuid: conversation?.project_uuid,
      conversationId: message.conversation_id,
      messageIds: [fullMessage.id],
    });

    return fullMessage;
  }

  async deleteMessage(id: string): Promise<void> {
    const db = await this.ensureDB();
    const existing = await db.get("messages", id);
    await db.delete("messages", id);

    if (existing) {
      const conversation = await db.get(
        "conversations",
        existing.conversation_id,
      );
      dispatchConversationEvent("messages-updated", {
        projectUuid: conversation?.project_uuid,
        conversationId: existing.conversation_id,
        messageIds: [id],
      });
    }
  }

  async createMessages(messages: CreateMessageInput[]): Promise<Message[]> {
    const db = await this.ensureDB();
    const tx = db.transaction(
      ["messages", "conversation_sequences"],
      "readwrite",
    );
    const store = tx.objectStore("messages");
    const defaultTimestamp = Date.now();

    const inserted: Message[] = [];

    for (const msg of messages) {
      const createdAt =
        typeof msg.created_at === "number"
          ? msg.created_at
          : typeof msg.createdAt === "number"
            ? msg.createdAt
            : defaultTimestamp;

      const sequenceNumber =
        typeof msg.sequence_number === "number"
          ? msg.sequence_number
          : await this.getNextSequence(tx, msg.conversation_id);

      if (typeof msg.sequence_number === "number") {
        await this.ensureSequenceFloor(tx, msg.conversation_id, sequenceNumber);
      }

      const fullMessage: Message = {
        id: msg.id,
        conversation_id: msg.conversation_id,
        role: msg.role,
        parts_structure: msg.parts_structure,
        model_name: msg.model_name ?? null,
        xml_version_id: msg.xml_version_id,
        sequence_number: sequenceNumber,
        created_at: createdAt,
      };

      await store.put(fullMessage);
      inserted.push(fullMessage);
    }

    await tx.done;

    const conversationIds = Array.from(
      new Set(messages.map((msg) => msg.conversation_id)),
    );
    for (const conversationId of conversationIds) {
      const conversation = await db.get("conversations", conversationId);
      const relatedMessageIds = inserted
        .filter((msg) => msg.conversation_id === conversationId)
        .map((msg) => msg.id);
      dispatchConversationEvent("messages-updated", {
        projectUuid: conversation?.project_uuid,
        conversationId,
        messageIds: relatedMessageIds,
      });
    }

    return inserted;
  }
}

import { openDB, type IDBPDatabase } from "idb";
import type { StorageAdapter } from "./adapter";
import type {
  Setting,
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  XMLVersion,
  CreateXMLVersionInput,
  Conversation,
  CreateConversationInput,
  UpdateConversationInput,
  Message,
  CreateMessageInput,
} from "./types";
import { DB_NAME, DB_VERSION, DEFAULT_PROJECT_UUID } from "./constants";

/**
 * IndexedDB 存储实现（Web 环境）
 * 使用 idb 库提供 Promise 化的 IndexedDB API
 */
export class IndexedDBStorage implements StorageAdapter {
  private db: IDBPDatabase | null = null;
  private initPromise: Promise<void> | null = null;

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
        upgrade(db, oldVersion, newVersion, _transaction) {
          console.log(
            `Upgrading IndexedDB from ${oldVersion} to ${newVersion}`,
          );

          // Settings store
          if (!db.objectStoreNames.contains("settings")) {
            db.createObjectStore("settings", { keyPath: "key" });
          }

          // Projects store
          if (!db.objectStoreNames.contains("projects")) {
            db.createObjectStore("projects", { keyPath: "uuid" });
          }

          // XMLVersions store
          if (!db.objectStoreNames.contains("xml_versions")) {
            const xmlStore = db.createObjectStore("xml_versions", {
              keyPath: "id",
              autoIncrement: true,
            });
            xmlStore.createIndex("project_uuid", "project_uuid", {
              unique: false,
            });
          }

          // Conversations store
          if (!db.objectStoreNames.contains("conversations")) {
            const convStore = db.createObjectStore("conversations", {
              keyPath: "id",
            });
            convStore.createIndex("project_uuid", "project_uuid", {
              unique: false,
            });
            convStore.createIndex("xml_version_id", "xml_version_id", {
              unique: false,
            });
          }

          // Messages store
          if (!db.objectStoreNames.contains("messages")) {
            const msgStore = db.createObjectStore("messages", {
              keyPath: "id",
            });
            msgStore.createIndex("conversation_id", "conversation_id", {
              unique: false,
            });
          }
        },
      });

      // 确保默认工程存在
      await this._ensureDefaultProject();

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
      ["projects", "xml_versions", "conversations", "messages"],
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

  async getXMLVersion(id: number): Promise<XMLVersion | null> {
    const db = await this.ensureDB();
    const version = await db.get("xml_versions", id);
    return version || null;
  }

  async createXMLVersion(version: CreateXMLVersionInput): Promise<XMLVersion> {
    const db = await this.ensureDB();
    const now = Date.now();
    const fullVersion = {
      ...version,
      created_at: now,
    };

    const id = await db.add("xml_versions", fullVersion);

    const created = await db.get("xml_versions", id);
    return created!;
  }

  async getXMLVersionsByProject(projectUuid: string): Promise<XMLVersion[]> {
    const db = await this.ensureDB();
    const versions = await db.getAllFromIndex(
      "xml_versions",
      "project_uuid",
      projectUuid,
    );
    // 按创建时间倒序
    return versions.sort((a, b) => b.created_at - a.created_at);
  }

  async deleteXMLVersion(id: number): Promise<void> {
    const db = await this.ensureDB();

    // 级联删除关联的对话和消息
    const tx = db.transaction(
      ["xml_versions", "conversations", "messages"],
      "readwrite",
    );

    const conversations = await tx
      .objectStore("conversations")
      .index("xml_version_id")
      .getAll(id);

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
  }

  async deleteConversation(id: string): Promise<void> {
    const db = await this.ensureDB();

    // 级联删除消息
    const tx = db.transaction(["conversations", "messages"], "readwrite");

    const messages = await tx
      .objectStore("messages")
      .index("conversation_id")
      .getAll(id);
    for (const msg of messages) {
      await tx.objectStore("messages").delete(msg.id);
    }

    await tx.objectStore("conversations").delete(id);

    await tx.done;
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

  async getConversationsByXMLVersion(
    xmlVersionId: number,
  ): Promise<Conversation[]> {
    const db = await this.ensureDB();
    const conversations = await db.getAllFromIndex(
      "conversations",
      "xml_version_id",
      xmlVersionId,
    );
    // 按更新时间倒序
    return conversations.sort((a, b) => b.updated_at - a.updated_at);
  }

  // ==================== Messages ====================

  async getMessagesByConversation(conversationId: string): Promise<Message[]> {
    const db = await this.ensureDB();
    const messages = await db.getAllFromIndex(
      "messages",
      "conversation_id",
      conversationId,
    );
    // 按创建时间正序
    return messages.sort((a, b) => a.created_at - b.created_at);
  }

  async createMessage(message: CreateMessageInput): Promise<Message> {
    const db = await this.ensureDB();
    const now = Date.now();
    const fullMessage: Message = {
      ...message,
      created_at: now,
    };

    await db.put("messages", fullMessage);
    return fullMessage;
  }

  async deleteMessage(id: string): Promise<void> {
    const db = await this.ensureDB();
    await db.delete("messages", id);
  }

  async createMessages(messages: CreateMessageInput[]): Promise<Message[]> {
    const db = await this.ensureDB();
    const now = Date.now();
    const tx = db.transaction("messages", "readwrite");

    const fullMessages: Message[] = messages.map((msg) => ({
      ...msg,
      created_at: now,
    }));

    for (const msg of fullMessages) {
      await tx.store.put(msg);
    }

    await tx.done;

    return fullMessages;
  }
}

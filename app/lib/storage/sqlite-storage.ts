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

/**
 * SQLite 存储实现（Electron 环境）
 * 通过 IPC 调用主进程的 SQLiteManager
 */
export class SQLiteStorage implements StorageAdapter {
  private async ensureElectron() {
    if (!window.electronStorage) {
      throw new Error(
        "electronStorage is not available. Not in Electron environment.",
      );
    }
  }

  async initialize(): Promise<void> {
    await this.ensureElectron();
    await window.electronStorage!.initialize();
  }

  // ==================== Settings ====================

  async getSetting(key: string): Promise<string | null> {
    await this.ensureElectron();
    return window.electronStorage!.getSetting(key);
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.ensureElectron();
    await window.electronStorage!.setSetting(key, value);
  }

  async deleteSetting(key: string): Promise<void> {
    await this.ensureElectron();
    await window.electronStorage!.deleteSetting(key);
  }

  async getAllSettings(): Promise<Setting[]> {
    await this.ensureElectron();
    return window.electronStorage!.getAllSettings();
  }

  // ==================== Projects ====================

  async getProject(uuid: string): Promise<Project | null> {
    await this.ensureElectron();
    return window.electronStorage!.getProject(uuid);
  }

  async createProject(project: CreateProjectInput): Promise<Project> {
    await this.ensureElectron();
    return window.electronStorage!.createProject(project);
  }

  async updateProject(
    uuid: string,
    updates: UpdateProjectInput,
  ): Promise<void> {
    await this.ensureElectron();
    await window.electronStorage!.updateProject(uuid, updates);
  }

  async deleteProject(uuid: string): Promise<void> {
    await this.ensureElectron();
    await window.electronStorage!.deleteProject(uuid);
  }

  async getAllProjects(): Promise<Project[]> {
    await this.ensureElectron();
    return window.electronStorage!.getAllProjects();
  }

  // ==================== XMLVersions ====================

  async getXMLVersion(id: number): Promise<XMLVersion | null> {
    await this.ensureElectron();
    const result = await window.electronStorage!.getXMLVersion(id);
    if (result && result.preview_image) {
      // Buffer → Blob 转换
      const buffer = result.preview_image as unknown as ArrayBuffer;
      result.preview_image = new Blob([buffer]);
    }
    return result;
  }

  async createXMLVersion(version: CreateXMLVersionInput): Promise<XMLVersion> {
    await this.ensureElectron();
    // Blob → ArrayBuffer 转换
    const versionToCreate: CreateXMLVersionInput = { ...version };
    if (version.preview_image instanceof Blob) {
      versionToCreate.preview_image =
        (await version.preview_image.arrayBuffer()) as unknown as Blob;
    }
    const result =
      await window.electronStorage!.createXMLVersion(versionToCreate);
    if (result.preview_image) {
      const buffer = result.preview_image as unknown as ArrayBuffer;
      result.preview_image = new Blob([buffer]);
    }
    return result;
  }

  async getXMLVersionsByProject(projectUuid: string): Promise<XMLVersion[]> {
    await this.ensureElectron();
    const results =
      await window.electronStorage!.getXMLVersionsByProject(projectUuid);
    return results.map((r) => {
      if (r.preview_image) {
        const buffer = r.preview_image as unknown as ArrayBuffer;
        r.preview_image = new Blob([buffer]);
      }
      return r;
    });
  }

  async deleteXMLVersion(id: number): Promise<void> {
    await this.ensureElectron();
    await window.electronStorage!.deleteXMLVersion(id);
  }

  // ==================== Conversations ====================

  async getConversation(id: string): Promise<Conversation | null> {
    await this.ensureElectron();
    return window.electronStorage!.getConversation(id);
  }

  async createConversation(
    conversation: CreateConversationInput,
  ): Promise<Conversation> {
    await this.ensureElectron();
    return window.electronStorage!.createConversation(conversation);
  }

  async updateConversation(
    id: string,
    updates: UpdateConversationInput,
  ): Promise<void> {
    await this.ensureElectron();
    await window.electronStorage!.updateConversation(id, updates);
  }

  async deleteConversation(id: string): Promise<void> {
    await this.ensureElectron();
    await window.electronStorage!.deleteConversation(id);
  }

  async getConversationsByProject(
    projectUuid: string,
  ): Promise<Conversation[]> {
    await this.ensureElectron();
    return window.electronStorage!.getConversationsByProject(projectUuid);
  }

  async getConversationsByXMLVersion(
    xmlVersionId: number,
  ): Promise<Conversation[]> {
    await this.ensureElectron();
    return window.electronStorage!.getConversationsByXMLVersion(xmlVersionId);
  }

  // ==================== Messages ====================

  async getMessagesByConversation(conversationId: string): Promise<Message[]> {
    await this.ensureElectron();
    return window.electronStorage!.getMessagesByConversation(conversationId);
  }

  async createMessage(message: CreateMessageInput): Promise<Message> {
    await this.ensureElectron();
    return window.electronStorage!.createMessage(message);
  }

  async deleteMessage(id: string): Promise<void> {
    await this.ensureElectron();
    await window.electronStorage!.deleteMessage(id);
  }

  async createMessages(messages: CreateMessageInput[]): Promise<Message[]> {
    await this.ensureElectron();
    return window.electronStorage!.createMessages(messages);
  }
}

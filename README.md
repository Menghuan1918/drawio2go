# DrawIO2Go

<p align="center">
  <strong>AI-Powered Cross-Platform DrawIO Editor</strong>
</p>

<p align="center">
  <a href="./README_zh-CN.md">简体中文</a> | English
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-38.x-47848F?logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License">
</p>

---

A modern, cross-platform DrawIO editor application built with Electron, Next.js 15, and HeroUI v3. Features AI-assisted diagram editing, version control, and a beautiful Material Design interface.

## Features

- **AI-Powered Editing** - Chat with AI to create, modify, and understand your diagrams
- **Version Control** - Full version history with diff comparison and rollback support
- **Cross-Platform** - Runs on Windows, macOS, Linux, and in web browsers
- **Modern UI** - Material Design interface with HeroUI v3 components
- **Multi-Language** - Supports English, Chinese (zh-CN), and Japanese (ja-JP)
- **Real-time Sync** - Socket.IO powered communication between AI and editor
- **Dark Mode** - System-aware theme switching

## Tech Stack

| Category           | Technology                                |
| ------------------ | ----------------------------------------- |
| **Frontend**       | Next.js 15 (App Router) + React 19        |
| **UI Library**     | HeroUI v3 (Beta) - React Aria Components  |
| **Styling**        | Tailwind CSS v4                           |
| **Desktop**        | Electron 38.x                             |
| **AI Integration** | Vercel AI SDK with multi-provider support |
| **Storage**        | SQLite (Electron) / IndexedDB (Web)       |
| **Language**       | TypeScript                                |

## Quick Start

### Prerequisites

- Node.js 20.x or higher
- pnpm (recommended) or npm

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/drawio2go.git
cd drawio2go

# Install dependencies
pnpm install
```

### Development

**Web Mode (Browser):**

```bash
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

**Desktop Mode (Electron):**

```bash
pnpm run electron:dev
```

### Production Build

```bash
# Build Next.js
pnpm run build

# Build Electron app (outputs to dist/)
pnpm run electron:build
```

## Project Structure

```
drawio2go/
├── app/                    # Next.js App Router
│   ├── components/         # React components
│   │   ├── chat/          # AI chat module
│   │   ├── settings/      # Settings panels
│   │   ├── version/       # Version management
│   │   └── toast/         # Notification system
│   ├── lib/               # Utilities & services
│   │   └── storage/       # Unified storage layer
│   ├── hooks/             # React hooks
│   ├── i18n/              # Internationalization
│   ├── api/               # API routes
│   └── styles/            # CSS modules
├── electron/              # Electron main process
└── server.js              # Socket.IO + Next.js server
```

## Configuration

### AI Provider Setup

1. Open the sidebar and navigate to **Settings** tab
2. Configure your preferred AI provider:
   - **Anthropic Claude** - API key from [anthropic.com](https://anthropic.com)
   - **OpenAI** - API key from [openai.com](https://openai.com)
   - **DeepSeek** - API key from [deepseek.com](https://deepseek.com)
   - **OpenAI Compatible** - Custom endpoint for local models (LM Studio, etc.)

### Supported AI Models

- Claude 3.5 Sonnet / Claude 3 Opus
- GPT-4o / GPT-4 Turbo
- DeepSeek V3 / DeepSeek Reasoner
- Any OpenAI-compatible model

## Usage

### Interface Overview

- **Editor Area** - Main DrawIO canvas for diagram editing
- **Top Bar** - Project selector, save/load actions, sidebar toggle
- **Sidebar** - Tabbed interface for Chat, Settings, and Version history

### AI Chat

1. Click the sidebar icon to expand
2. Select the **Chat** tab
3. Describe what you want to create or modify
4. AI will execute changes directly on your diagram

### Version Management

1. Navigate to the **Version** tab in sidebar
2. View version timeline with thumbnails
3. Compare versions with smart diff visualization
4. Restore any previous version with one click

## Development

### Commands

```bash
pnpm run dev          # Start development server
pnpm run build        # Build for production
pnpm run lint         # Run ESLint + TypeScript check
pnpm run test         # Run tests
pnpm run format       # Format code with Prettier
```

### Architecture Notes

- Uses **pnpm** as package manager
- Must use `pnpm run dev` (not `next dev`) for Socket.IO support
- HeroUI v3 requires Tailwind CSS v4
- Components use `onPress` instead of `onClick` (React Aria convention)

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a PR.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [DrawIO](https://www.drawio.com/) - Diagram editing engine
- [HeroUI](https://heroui.com/) - UI component library
- [Vercel AI SDK](https://sdk.vercel.ai/) - AI integration framework
- [Electron](https://www.electronjs.org/) - Desktop application framework

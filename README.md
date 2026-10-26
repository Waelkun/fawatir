# Fawatir (فواتير) — Smart AI Receipt & Expense Management System

<p align="center">
  <img src="docs/screenshots/fawatir-brand-icon.png" alt="Fawatir App Icon" width="120" style="border-radius: 24px;" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Client-React%20Native%20%7C%20Expo%20Go-000020?style=for-the-badge&logo=expo&logoColor=white" alt="Expo Go" />
  <img src="https://img.shields.io/badge/Backend-Node.js%20%26%20Express-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Hosting-Render-46E3B7?style=for-the-badge&logo=render&logoColor=black" alt="Render" />
  <img src="https://img.shields.io/badge/Database-Neon%20PostgreSQL-00E599?style=for-the-badge&logo=postgresql&logoColor=black" alt="Neon PostgreSQL" />
  <img src="https://img.shields.io/badge/AI%20Engine-Google%20Gemini-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Google Gemini" />
</p>

<p align="center">
  An intelligent, AI-powered personal finance and receipt tracking ecosystem. Fawatir combines real-time computer vision with Google Gemini AI to transform physical and digital receipts into itemized expenses, debts, product price trackers, and actionable financial insights.
</p>

---

## 📱 Project Status

> 🚀 **Current Stage:** Active Development & Beta Testing via **Expo Go**.  
> The mobile application is tested directly on physical iOS/Android devices using Expo Go, with the backend API deployed on **Render** and the primary database hosted on **Neon PostgreSQL**.

---

## 🏗️ Architecture & Cloud Infrastructure

Fawatir is architected as a clean client-server system with cloud-native persistence and generative AI processing:

```mermaid
flowchart LR
    subgraph Client["Mobile Layer (Expo Go)"]
        UserDevice[iOS / Android Device]
        ExpoCamera[Expo Camera & ImagePicker]
    end

    subgraph BackendCloud["Backend Cloud (Render)"]
        ExpressAPI[Express.js REST API]
        PrismaORM[Prisma ORM]
        Sharp[Sharp Image Preprocessing]
    end

    subgraph AICloud["AI Intelligence Layer"]
        Gemini[Google Gemini 1.5 Flash]
    end

    subgraph DBCloud["Database Layer (Neon)"]
        NeonDB[(Neon Serverless PostgreSQL)]
    end

    UserDevice -->|1. Capture Receipt| ExpoCamera
    ExpoCamera -->|2. Multipart Upload| ExpressAPI
    ExpressAPI -->|3. Clean & Optimize| Sharp
    Sharp -->|4. Multimodal OCR & Extraction| Gemini
    Gemini -->|5. Structured JSON| ExpressAPI
    ExpressAPI -->|6. Persist Transactions| PrismaORM
    PrismaORM -->|7. SQL Pooling| NeonDB
    ExpressAPI -->|8. Normalized Data| UserDevice
```

---

## ✨ Key Features

- **🧾 Instant AI Receipt Scanner:** Snap a picture of any invoice or receipt (Arabic/English). Google Gemini extracts store name, total, date, and individual itemized products automatically.
- **📊 Real-time Financial Analytics:** Interactive charts for monthly spendings, top categories, and daily outflow breakdowns.
- **👥 Debt & Creditor Management (سجل الديون):** Track money owed to or by you with contact links and payment status.
- **🏷️ Product Price Intelligence:** Automatically logs scanned goods to monitor price fluctuations over time across different merchants.
- **💱 Multi-Currency & Localization:** Seamless handling of multiple currencies with Arabic RTL and English support.
- **🎨 Premium Fintech UI:** Dark-mode glassmorphic interface built with React Native and custom SVG visualizers.

---

## 🛠️ Tech Stack Breakdown

### Mobile Client (`/mobile`)
- **Framework:** React Native with Expo (SDK 54+)
- **Navigation:** React Navigation (Stack & Bottom Tabs)
- **Icons & Graphics:** `@expo/vector-icons`, `react-native-svg`
- **Device APIs:** `expo-camera`, `expo-image-picker`, `expo-file-system`, `expo-secure-store`

### Backend Service (`/backend`)
- **Runtime:** Node.js & Express.js
- **Deployment:** Render Web Service
- **ORM & Migrations:** Prisma ORM
- **Database:** Neon Cloud (Serverless PostgreSQL with Connection Pooling)
- **AI Processing:** `@google/generative-ai` (Gemini 1.5 Flash)
- **Image Pipeline:** `multer`, `sharp`
- **Security:** JSON Web Tokens (JWT), `bcryptjs` password hashing

---

## 🚀 Local Development Setup

### 1. Prerequisites
- Node.js (v18+)
- Expo Go app on your smartphone or an iOS/Android simulator
- A Neon PostgreSQL database instance
- A Google Gemini API key

---

### 2. Backend Setup (`/backend`)

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   Configure your credentials:
   ```env
   PORT=5000
   DATABASE_URL="postgresql://username:password@ep-your-database.neon.tech/neondb?sslmode=require"
   GEMINI_API_KEY="your-gemini-api-key"
   JWT_SECRET="your-strong-jwt-secret"
   ```
4. Run database migrations:
   ```bash
   npx prisma db push
   # or run the automated db setup script:
   npm run db:setup
   ```
5. Start the backend:
   ```bash
   npm run dev
   ```

---

### 3. Mobile Client Setup (`/mobile`)

1. Navigate to the mobile directory:
   ```bash
   cd ../mobile
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure the backend URL in `mobile/src/config/api.js` (pointing to your Render deployment URL or local machine IP):
   ```javascript
   export const API_BASE_URL = 'https://your-fawatir-backend.onrender.com/api';
   ```
4. Start the Expo development server:
   ```bash
   npx expo start
   ```
5. Scan the generated QR code with **Expo Go** on your device.

---

## 🔒 Security & Environment Rules

- **No sensitive credentials committed:** Secrets, API keys, and connection strings are strictly managed via environment variables.
- Always use `.env.example` as a template and keep production variables configured inside the Render dashboard.

---

## 📄 License

Maintained by [Waelkun](https://github.com/Waelkun). All rights reserved.

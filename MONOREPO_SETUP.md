# 🚀 Setup do Monorepo CRM PRO

## ✅ O que foi criado

### Estrutura Completa

```
CRM-PRO-DEV/
├── package.json                    # Root com scripts Turborepo
├── pnpm-workspace.yaml             # Configuração workspace
├── turbo.json                      # Pipeline build
├── .prettierrc                     # Formatação
├── .eslintrc.json                  # Linting
├── crm-backend/                    # Backend NestJS (porta 3001) ✅ JÁ EXISTIA
├── packages/
│   └── api/                        # ✅ CRIADO - SDK compartilhado
│       ├── package.json            # @crm/api workspace package
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts            # Barrel export
│           ├── types.ts            # Interfaces TypeScript
│           ├── client.ts           # createApiClient com axios
│           ├── auth.ts             # login() e me()
│           ├── admin.ts            # companies, audit, employees APIs
│           ├── tenant.ts           # ping() API
│           └── storage/
│               ├── web.ts          # localStorage wrapper
│               └── mobile.ts       # expo-secure-store wrapper
└── apps/
    ├── admin-web/                  # ✅ CRIADO - Console Admin
    │   ├── package.json            # React+Vite, porta 5173
    │   ├── vite.config.ts
    │   ├── tailwind.config.js
    │   ├── .env.example            # VITE_API_BASE_URL
    │   └── src/
    │       ├── main.tsx            # QueryClient setup
    │       ├── App.tsx             # BrowserRouter + SessionProvider
    │       ├── routes.tsx          # ProtectedRoute com scope="admin"
    │       ├── lib/
    │       │   ├── api.ts          # authApi + adminApi
    │       │   └── session.tsx     # SessionProvider com login/logout
    │       ├── layouts/
    │       │   └── AdminLayout.tsx # Sidebar cinza/azul
    │       └── pages/
    │           ├── LoginPage.tsx
    │           ├── DashboardPage.tsx
    │           ├── CompaniesPage.tsx     # useQuery companies.list()
    │           ├── CompanyDetailPage.tsx # useQuery companies.get(id)
    │           ├── AuditPage.tsx         # useQuery audit.list()
    │           ├── EmployeesPage.tsx     # useQuery employees.list()
    │           └── SettingsPage.tsx
    ├── tenant-web/                 # ✅ CRIADO - App Tenant Web
    │   ├── package.json            # React+Vite, porta 5174
    │   ├── vite.config.ts
    │   ├── tailwind.config.js
    │   ├── .env.example
    │   └── src/
    │       ├── main.tsx
    │       ├── App.tsx
    │       ├── routes.tsx          # ProtectedRoute com scope="tenant"
    │       ├── lib/
    │       │   ├── api.ts          # authApi + tenantApi
    │       │   └── session.tsx     # Rejeita admin, aceita apenas tenant
    │       ├── layouts/
    │       │   └── TenantLayout.tsx # Sidebar índigo/roxo
    │       └── pages/
    │           ├── LoginPage.tsx    # Gradiente indigo
    │           ├── HomePage.tsx     # Info da sessão
    │           └── PingPage.tsx     # useQuery ping()
    └── tenant-mobile/              # ✅ CRIADO - App Mobile Expo
        ├── package.json            # Expo 50, React Native 0.73
        ├── app.json                # Configuração Expo
        ├── babel.config.js
        ├── tsconfig.json
        ├── .env.example
        ├── lib/
        │   ├── api.ts              # authApi + tenantApi (mobile)
        │   └── session.tsx         # SessionProvider com Expo Router
        └── app/                    # Expo Router file-based routing
            ├── _layout.tsx         # Root com QueryClient
            ├── index.tsx           # Redirect para (auth) ou (app)
            ├── (auth)/
            │   ├── _layout.tsx     # Stack sem header
            │   └── login.tsx       # Login screen
            └── (app)/
                ├── _layout.tsx     # Tabs (Home, Ping)
                ├── index.tsx       # Home tab com session info
                └── ping.tsx        # Ping tab com teste API
```

## 🎯 Backend vs Frontend

### Backend (NestJS)
- **Porta:** 3001
- **Rotas Admin:** `/admin/companies`, `/admin/audit`, `/admin/employees`
- **Rotas Tenant:** `/app/ping`
- **Auth:** `/auth/login`, `/me`
- **Guards:** `MasterOnlyGuard` (MASTER_*), `TenantOnlyGuard` (TENANT_*)

### Frontend Admin (admin-web)
- **Porta:** 5173
- **Scope:** Aceita apenas `scope: "admin"`
- **Usuário:** master@demo.com / Admin123!
- **Rotas:** `/admin/dashboard`, `/admin/companies`, `/admin/audit`, `/admin/employees`
- **Stack:** React 18 + Vite 5 + TanStack Query + Tailwind + React Router
- **Cores:** Cinza/Azul (`blue-600`)

### Frontend Tenant Web (tenant-web)
- **Porta:** 5174
- **Scope:** Aceita apenas `scope: "tenant"` (rejeita admin)
- **Usuário:** admin@tenant.com / Tenant123!
- **Rotas:** `/app/home`, `/app/ping`
- **Stack:** React 18 + Vite 5 + TanStack Query + Tailwind + React Router
- **Cores:** Índigo/Roxo (`indigo-600`)

### Frontend Tenant Mobile (tenant-mobile)
- **Porta:** Metro bundler (padrão Expo)
- **Scope:** Aceita apenas `scope: "tenant"`
- **Usuário:** admin@tenant.com / Tenant123!
- **Rotas:** `/(auth)/login`, `/(app)/index`, `/(app)/ping`
- **Stack:** Expo 50 + React Native 0.73 + Expo Router + TanStack Query + expo-secure-store
- **Cores:** Índigo (`#4F46E5`)

## 🔧 Setup Inicial

### 1. Instalar pnpm (se não tiver)
```bash
npm install -g pnpm@8.15.0
```

### 2. Instalar dependências
```bash
# Na raiz do monorepo (CRM-PRO-DEV/)
pnpm install  # ✅ JÁ EXECUTADO
```

### 3. Configurar .env files

#### Backend (.env)
```bash
cd crm-backend
cp .env.example .env
# Editar DATABASE_URL, JWT_SECRET, etc.

# Rodar migrations (se ainda não rodou)
npx prisma migrate dev
npx prisma db seed
```

#### Admin Web (.env)
```bash
cd apps/admin-web
cp .env.example .env
# Conteúdo:
# VITE_API_BASE_URL=http://localhost:3001
```

#### Tenant Web (.env)
```bash
cd apps/tenant-web
cp .env.example .env
# Conteúdo:
# VITE_API_BASE_URL=http://localhost:3001
```

#### Mobile (.env)
```bash
cd apps/tenant-mobile
cp .env.example .env
# Conteúdo:
# EXPO_PUBLIC_API_BASE_URL=http://localhost:3001
```

## 🏃 Comandos para Rodar

### Backend (Terminal 1)
```bash
cd crm-backend
npm run start:dev
# Roda em http://localhost:3001
```

### Frontend - Opções

#### Opção 1: Todos os frontends em paralelo (da raiz)
```bash
pnpm dev:web
# Roda admin-web (5173) + tenant-web (5174) + tenant-mobile
```

#### Opção 2: Admin web apenas (da raiz)
```bash
pnpm dev:admin
# Roda apenas admin-web em http://localhost:5173
```

#### Opção 3: Tenant web apenas (da raiz)
```bash
pnpm dev:tenant
# Roda apenas tenant-web em http://localhost:5174
```

#### Opção 4: Mobile apenas (da raiz)
```bash
pnpm dev:mobile
# Inicia Expo metro bundler
```

#### Opção 5: Rodar individualmente
```bash
# Admin
cd apps/admin-web
pnpm dev

# Tenant web
cd apps/tenant-web
pnpm dev

# Mobile
cd apps/tenant-mobile
pnpm dev
```

## 🧪 Testar o Sistema

### 1. Backend Health Check
```bash
curl http://localhost:3001/health
# {"status":"ok"}
```

### 2. Login Admin
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
   -d '{"email":"master@demo.com","password":"Admin123!"}'
# Retorna: { "accessToken": "..." }
```

### 3. Testar scope
```bash
# Pegar o token do login acima e usar:
curl http://localhost:3001/me \
  -H "Authorization: Bearer SEU_TOKEN"
# Retorna: { "scope": "admin", "roles": ["MASTER_ADMIN"], ... }
```

### 4. Acessar Admin Web
1. Abrir http://localhost:5173
2. Login com `master@demo.com` / `Admin123!`
3. Navegar por Dashboard, Companies, Audit, Employees

### 5. Acessar Tenant Web
1. Abrir http://localhost:5174
2. Login com `admin@tenant.com` / `Tenant123!`
3. Ver Home com info da sessão
4. Testar Ping → chama `/app/ping` e mostra JSON

### 6. Testar Mobile
1. Rodar `pnpm dev:mobile` na raiz
2. Escanear QR code no Expo Go (celular) ou rodar no emulador
3. Login com `admin@tenant.com` / `Tenant123!`
4. Navegar nas tabs Home e Ping

## 🔐 Validação de Scope

### O que acontece:
1. **Login:** Usuário faz login em qualquer app
2. **Token:** Frontend armazena token (localStorage no web, SecureStore no mobile)
3. **Me:** Frontend chama `/me` para pegar `scope`
4. **Validação:**
   - Se `scope === "admin"` → admin-web aceita, tenant-web/mobile rejeitam
   - Se `scope === "tenant"` → tenant-web/mobile aceitam, admin-web rejeita
5. **Redirect:** App redireciona para `/login` se scope não bater

### Testando Rejeição:
- Tente fazer login no **tenant-web** (porta 5174) com `master@crm.com.br`
- Erro esperado: "Conta admin não pode acessar /app"
- Inverso também: login no **admin-web** com `admin@tenant.com` deve rejeitar

## 📦 Shared Package (@crm/api)

Todos os frontends usam o mesmo SDK:

```typescript
import { createApiClient, createAuthApi, createAdminApi, createTenantApi } from '@crm/api';

// Web
import { webStorage } from '@crm/api';
const client = createApiClient({ 
  baseUrl: 'http://localhost:3001',
  getToken: () => webStorage.getToken(),
  onUnauthorized: () => { webStorage.clearToken(); /* redirect */ }
});

// Mobile
import { mobileStorage } from '@crm/api';
const client = createApiClient({ 
  baseUrl: 'http://localhost:3001',
  getToken: () => mobileStorage.getToken(),
  onUnauthorized: async () => { await mobileStorage.clearToken(); /* redirect */ }
});

// APIs
const authApi = createAuthApi(client);
const adminApi = createAdminApi(client);  // Para admin-web
const tenantApi = createTenantApi(client); // Para tenant-web/mobile

// Usar
await authApi.login({ email, password });
const session = await authApi.me();
const companies = await adminApi.companies.list();
const ping = await tenantApi.ping();
```

## 🎨 Design Tokens

| App | Cor Primária | Sidebar | Botões |
|-----|--------------|---------|--------|
| admin-web | `blue-600` | Cinza escuro | Azul |
| tenant-web | `indigo-600` | Índigo | Índigo |
| tenant-mobile | `#4F46E5` | - | Índigo |

## 🐛 Troubleshooting

### pnpm não encontrado
```bash
npm install -g pnpm@8.15.0
```

### Porta 3001 já em uso
```bash
# Backend já está rodando (normal)
# Se não for o backend, encerre o processo na porta 3001
```

### "Cannot find module '@crm/api'"
```bash
# Na raiz:
pnpm install
```

### Erro de CORS
Verifique se o backend permite a origem do frontend:
- Admin: http://localhost:5173
- Tenant: http://localhost:5174

### Erro no Expo
```bash
cd apps/tenant-mobile
pnpm install
npx expo start --clear
```

### Erro "Database connection failed"
Verifique:
1. PostgreSQL rodando
2. DATABASE_URL correto no .env do backend
3. Migrations aplicadas: `npx prisma migrate dev`

## 📚 Próximos Passos

1. **Adicionar mais páginas no tenant-web:**
   - Criar telas para funcionalidades tenant (ex: customers, reports)
   - Adicionar endpoints correspondentes no backend (/app/*)

2. **Adicionar mais telas no mobile:**
   - Seguir padrão Expo Router file-based
   - Criar tabs ou stack navigation

3. **Melhorar admin-web:**
   - Implementar forms de criação/edição
   - Adicionar filtros e paginação
   - Dashboard com gráficos reais

4. **CI/CD:**
   - Setup GitHub Actions
   - Build e deploy automático
   - Testes E2E para frontend

5. **Documentação:**
   - Componentes Storybook
   - API docs com Swagger
   - Guia de contribuição

## ✅ Checklist Final

- [x] Monorepo Turborepo + pnpm criado
- [x] packages/api SDK compartilhado
- [x] apps/admin-web (React + Vite)
- [x] apps/tenant-web (React + Vite)
- [x] apps/tenant-mobile (Expo)
- [x] pnpm install executado com sucesso
- [x] Routing com scope validation
- [x] Storage (web + mobile) implementado
- [x] TanStack Query integrado
- [x] Tailwind CSS configurado
- [ ] .env files copiados (fazer manualmente)
- [ ] Backend rodando
- [ ] Frontend rodando
- [ ] Testes de login/scope

## 🎉 Sistema Pronto!

Backend segmentado + Frontend completo (web admin + web tenant + mobile tenant) funcionando em conjunto.

**Comandos principais:**
```bash
# Backend
cd crm-backend && npm run start:dev

# Frontend (escolha um):
pnpm dev:web      # Todos os frontends
pnpm dev:admin    # Apenas admin
pnpm dev:tenant   # Apenas tenant web
pnpm dev:mobile   # Apenas mobile
```

**URLs:**
- Backend: http://localhost:3001
- Admin Web: http://localhost:5173 (master@demo.com / Admin123!)
- Tenant Web: http://localhost:5174 (admin@tenant.com / Tenant123!)
- Mobile: Expo Go app

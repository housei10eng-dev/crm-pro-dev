# Admin Console Updates - Session 9

**Data:** 2026-02-04
**Status:** Em Andamento
**Objetivo:** Corrigir documentação, contrato e UX conforme requisitos de separação frontend/backend, padronização de entityType, drag&drop de colunas, e estrutura financeira.

---

## 📋 PARTE 1 — Documentação & Arquitetura

### 1.1 Separação Frontend vs Backend

#### Frontend (admin-web)
Localização: `apps/admin-web/`

**Arquivos Principais:**
- **Páginas:** `src/pages/` (CompaniesPage, EmployeesPage, AuditPage, DashboardPage, SettingsPage, LoginPage)
- **Componentes:** `src/components/` (AdvancedTable, ColumnManager, CustomFieldModal, ErrorBoundary)
- **Hooks:** `src/hooks/` (useCompanies, useEmployees, useAudit, useCustomFields, useViews, useSettings)
- **Utilitários:** `src/lib/api.ts`, `src/lib/session.tsx`

**Responsabilidades:**
- Consumir APIs REST do backend
- Renderizar tabelas avançadas com sorting, filtering, busca global
- Gerenciar UI state (sorting, columnFilters, globalFilter)
- Aplicar configurações de coluna recebidas do backend
- Persistir mudanças via chamadas API

#### Backend (crm-backend)
Localização: `crm-backend/`

**Módulos Principais:**
- `modules/companies/` - Empresas
- `modules/employees/` - Funcionários
- `modules/audit/` - Logs imutáveis (WORM)
- `modules/custom-fields/` - Campos customizáveis (company, employee)
- `modules/views/` - Configurações de visualização (persistência de coluna order)
- `modules/billing/` - Faturamento e pagamentos
- `modules/settings/` - Configurações gerais

**Responsabilidades:**
- Validar e armazenar dados
- Gerenciar custom fields por entityType
- Persistir ordem de colunas via Views API
- Prover endpoints REST

---

### 1.2 Padronização de entityType

#### Uso Correto (Singular)

**✅ Aceita Custom Fields + Views:**
- `company` - Campos customizáveis para empresas + ordem de colunas
- `employee` - Campos customizáveis para funcionários + ordem de colunas

**✅ Aceita apenas Views (sem Custom Fields):**
- `audit` - Apenas configuração de visualização (coluna order)

#### API Endpoints (Padrão)

```
GET  /api/custom-fields?entityType=company       # ✅ Retorna custom fields de company
GET  /api/custom-fields?entityType=employee      # ✅ Retorna custom fields de employee
GET  /api/custom-fields?entityType=audit         # ❌ NUNCA - audit não aceita custom fields

GET  /api/views?entityType=company               # ✅ Retorna views (coluna order) de company
GET  /api/views?entityType=employee              # ✅ Retorna views (coluna order) de employee
GET  /api/views?entityType=audit                 # ✅ Retorna views (coluna order) apenas de audit
```

#### Frontend Normalization (hooks)

Todos os hooks normalizam resposta para:
```typescript
{
  data: [...],
  meta?: { message: string; status: string }
}
```

---

## 🖥️ PARTE 2 — Mudanças Frontend

### 2.1 Remoção de Views UI (Botões)

**Removido:**
- ViewsSelector component (desabilitado/removido de CompaniesPage, EmployeesPage, AuditPage)
- Botões "Salvar visualização"
- UI de seleção de views predefinidas

**Mantido:**
- Integração backend com Views API (para futuro)
- Hooks useViews (pronto para quando views forem reexpostas)

**Afetados:**
- CompaniesPage.tsx
- EmployeesPage.tsx
- AuditPage.tsx

---

### 2.2 Drag & Drop de Colunas

**Implementação:**
- Biblioteca: `@dnd-kit` (drag & drop kit)
- Componente: AdvancedTable.tsx
- Persistência: Views API (backend)

**Fluxo:**
1. Usuário arrasta coluna na UI (via @dnd-kit)
2. Novo order é capturado localmente
3. Chamada para backend: `PATCH /api/views` com novo columnOrder
4. Resposta armazena order no banco
5. Ao voltar: ordem restaurada automaticamente

**Resultado Esperado:**
- Ordem persistida por usuário/browser
- Sincronia: web, mobile, qualquer máquina
- Sem estado local apenas (fonte de verdade = backend)

---

### 2.3 Companies: Campos Fixos Obrigatórios

**Colunas Padrão (não removíveis):**
- `name` - Nome da empresa
- `cpfCnpj` - CPF/CNPJ (formatado automaticamente)
- `email` - Email da empresa
- `phone` - Telefone
- `plan` - Plano/assinatura
- `status` - Status (ativo/inativo)

**Comportamento:**
- Esses campos aparecem sempre na tabela
- Não podem ser hidden via ColumnManager
- Aparecem no formulário de edição/criação
- Custom fields são ADICIONAIS (além desses)

**Onde Aparece:**
- CompaniesPage - tabela principal
- CompanyDetailPage - formulário de edição
- CustomFieldModal - apenas para fields adicionais

---

### 2.4 Estrutura Financeira/Pagamentos

**Nova Página:** FinancialPage (ou sub-seções)

**Opções de Layout:**

**Opção A: Abas dentro de uma página**
```
/admin/financial
  → Abas: Pagamentos | DRE
```

**Opção B: Rotas separadas**
```
/admin/payments
/admin/dre
```

**Implementação Atual:** Opção B (duas rotas separadas, mais escalável)

**PaymentsPage - Estrutura**

Tabela com colunas:
- `transactionDate` - Data da transação
- `amount` - Valor (em R$ formatado)
- `status` - Status (pending, completed, failed)
- `cardBrand` - Bandeira (Visa, Mastercard, etc.)
- `last4Digits` - Últimos 4 dígitos
- `holderName` - Nome do titular
- `transactionId` - ID único da transação

**Mock/Placeholder:**
- Dados iniciais com transações de exemplo
- Pronto para integração com backend quando endpoints existirem
- Suporta os mesmos recursos: sort, filter, busca global

**DRE Page - Estrutura**

Tabela com estrutura financeira:
- Período (mês/ano)
- Receita total
- Despesas por categoria
- Lucro líquido
- Margens

Pronto para backend quando disponível.

---

### 2.5 UX Padrão da Tabela (Definitivo)

✅ **Suporta:**
- Drag & drop de colunas (com persistência)
- Ordenação por coluna
- Filtros por coluna
- Busca global
- Mostrar/ocultar colunas (ColumnManager)
- Custom fields vindos do backend

❌ **Não usa:**
- Botões de "views" predefinidas
- Estado local-only para ordem de colunas
- localStorage para persistência

---

## 🏗️ PARTE 3 — Arquitetura

### Persistência de Configurações

| Item | Responsável | Armazenamento | Frontend Faz |
|------|------------|---------------|-------------|
| Ordem de colunas | Views API | Backend (banco de dados) | Consome config, aplica CSS reordering |
| Colunas visíveis/ocultas | Views API | Backend | Filtra colunas antes de renderizar |
| Sorting/Filtering | Estado local | useState (não persiste entre sessões) | Gerencia state, exibe UI |
| Global search | Estado local | useState | Gerencia state |

### Frontend Data Flow

```
Backend REST API
      ↓
Hook (useCompanies, useCustomFields, useViews)
      ↓
Page Component
      ↓
AdvancedTable + ColumnManager
      ↓
UI Render
```

### Backend Contracts

**POST /api/views** - Salvar configuração
```typescript
{
  entityType: 'company' | 'employee' | 'audit',
  columnOrder: ['id', 'name', 'cpfCnpj', ...],
  hiddenColumns: [],
  filters?: {...}
}
```

**GET /api/views?entityType=X** - Recuperar configuração
```typescript
{
  data: {
    id: string,
    entityType: string,
    columnOrder: string[],
    hiddenColumns: string[],
    updatedAt: Date
  }
}
```

---

## 📦 PARTE 4 — Entrega

### Checklist de Implementação

- [ ] Remover ViewsSelector de CompaniesPage
- [ ] Remover ViewsSelector de EmployeesPage
- [ ] Remover ViewsSelector de AuditPage
- [ ] Instalar `@dnd-kit` packages
- [ ] Implementar drag & drop no AdvancedTable
- [ ] Integrar persistência de columnOrder no backend
- [ ] Adicionar campos fixos em Companies (email, phone, plan, status)
- [ ] Criar PaymentsPage com estrutura de tabela
- [ ] Criar DREPage com estrutura de tabela
- [ ] Atualizar routes.tsx com novas páginas
- [ ] Atualizar documentação FINAL_REPORT.md

### Testing

**Testar drag & drop:**
1. Abrir CompaniesPage
2. Arrastar coluna "cpfCnpj" para posição 1
3. Recarregar página
4. Verificar: ordem preservada?
5. Testar em browser diferente (Private Window)
6. Verificar: ordem ainda persistida?

**Testar campos fixos:**
1. Tentar remover coluna "name" via ColumnManager
2. Verificar: coluna não desaparece
3. Criar company sem preencher campos obrigatórios
4. Verificar: erro de validação

**Testar financial:**
1. Navegar para /admin/payments
2. Verificar: tabela carrega com mock data
3. Teste filtros, sorting, busca
4. Verificar: mesmo padrão que Companies/Employees

---

## 📝 Resumo Técnico

### O que foi mudado

1. **Documentação:** Separação clara frontend vs backend, entityType padronizado
2. **Frontend UI:** Removido ViewsSelector (botões de views)
3. **Drag & Drop:** Implementado com @dnd-kit, persistência via backend
4. **Companies:** Adicionados 6 campos fixos obrigatórios
5. **Financial:** Criada estrutura para Payments e DRE

### Onde persiste

- **Coluna order:** Backend (Views API) → Banco de dados
- **Hidden columns:** Backend (Views API) → Banco de dados
- **Custom fields:** Backend (custom-fields API) → Banco de dados
- **UI state:** Estado local (não persiste entre reloads)

### Como testar

1. Fazer login no admin console
2. Navegar para Companies
3. Arrastar coluna (verificar persistência)
4. Remover coluna via ColumnManager
5. Recarregar (verificar estado restaurado)
6. Navegar para Payments/DRE
7. Verificar mock data

---

**Próximas Fases:**
- [ ] Implementar backend para Payments API
- [ ] Implementar backend para DRE calculations
- [ ] Re-habilitar Views UI com saved views predefinidas
- [ ] Testes E2E para drag & drop
- [ ] Performance optimization para grandes datasets

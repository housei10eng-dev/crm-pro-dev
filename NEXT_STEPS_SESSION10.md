# 📋 Próximos Passos - Session 9 → Session 10

## Fase 1: Backend Persistence (CRÍTICO)

### 1.1 Implementar persistência de columnOrder via Views API

**Arquivo:** `crm-backend/src/modules/views/views.controller.ts`

```typescript
@Patch(':id')
async updateView(@Param('id') id: string, @Body() updateViewDto: UpdateViewDto) {
  // Salvar nova columnOrder
  return this.viewsService.update(id, updateViewDto);
}
```

**Arquivo:** `crm-backend/prisma/schema.prisma`

```prisma
model Views {
  id            String   @id @default(cuid())
  userId        String
  entityType    String   // 'company', 'employee'
  viewName      String?
  columnOrder   String[] @default([]) // ← Salvar ordem das colunas
  columnFilters Json?
  sorting        Json?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  @@unique([userId, entityType, viewName])
}
```

**Teste:**
```bash
curl -X PATCH http://localhost:3000/api/views/123 \
  -H "Content-Type: application/json" \
  -d '{ "columnOrder": ["name", "email", "cpfCnpj", "phone", "plan"] }'
```

---

### 1.2 Frontend: Conectar handleColumnOrderChange

**Arquivo:** `apps/admin-web/src/pages/CompaniesPage.tsx`

```typescript
const handleColumnOrderChange = (newOrder: string[]) => {
  setColumns(newOrder);
  
  // ← REMOVER TODO e implementar:
  viewsApi.updateColumnOrder('company', newOrder)
    .then(() => {
      // Sucesso - ordem persistida
      toast.success('Ordem de colunas salva');
    })
    .catch((err) => {
      toast.error('Erro ao salvar ordem');
      // Voltar ordem anterior
    });
};
```

**Aplicar em:**
- CompaniesPage.tsx
- EmployeesPage.tsx
- AuditPage.tsx

---

## Fase 2: Validação Backend (IMPORTANTE)

### 2.1 Impedir POST custom-fields para audit

**Arquivo:** `crm-backend/src/modules/custom-fields/custom-fields.controller.ts`

```typescript
@Post()
async create(@Body() createCustomFieldDto: CreateCustomFieldDto) {
  // Validação
  if (createCustomFieldDto.entityType === 'audit') {
    throw new BadRequestException('Cannot create custom fields for audit entity');
  }
  
  return this.customFieldsService.create(createCustomFieldDto);
}
```

**Teste:**
```bash
# Deve falhar com 400
curl -X POST http://localhost:3000/api/custom-fields \
  -H "Content-Type: application/json" \
  -d '{ "entityType": "audit", "name": "test" }'
```

---

### 2.2 Validar email e phone em Companies

**Arquivo:** `crm-backend/prisma/schema.prisma`

```prisma
model Companies {
  id         String   @id @default(cuid())
  name       String
  cpfCnpj    String   @unique
  email      String?  // ← Novo
  phone      String?  // ← Novo
  plan       String
  status     String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

**Validação DTO:**
```typescript
class CreateCompanyDto {
  @IsString()
  name: string;
  
  @IsString()
  @Matches(/^\d{11,14}$/, { message: 'Invalid CPF/CNPJ' })
  cpfCnpj: string;
  
  @IsEmail()
  @IsOptional()
  email?: string;
  
  @IsPhoneNumber('BR')
  @IsOptional()
  phone?: string;
}
```

---

## Fase 3: APIs para Payments e DRE (FUTURO)

### 3.1 Payments Endpoint

**Backend:** `GET /api/payments`

```typescript
@Get()
async findAll(@Query() query: PaymentsQueryDto) {
  return this.paymentsService.findAll({
    skip: query.skip,
    take: query.take,
    where: query.where,
    orderBy: query.orderBy,
  });
}
```

**Response:**
```json
{
  "data": [
    {
      "id": "1",
      "transactionDate": "2026-02-01T10:15:00Z",
      "amount": 1500.00,
      "status": "completed",
      "cardBrand": "Visa",
      "last4Digits": "4242",
      "holderName": "João Silva",
      "transactionId": "TXN001"
    }
  ],
  "total": 100,
  "pageCount": 5
}
```

### 3.2 DRE Endpoint

**Backend:** `GET /api/dre`

```typescript
@Get()
async findAll(@Query() period: string) {
  return this.dreService.getReport(period);
}
```

**Response:**
```json
{
  "period": "2026-02",
  "summary": {
    "totalRevenue": 20000,
    "totalExpense": 11500,
    "netProfit": 8500
  },
  "entries": [
    {
      "id": "1",
      "period": "2026-02",
      "category": "Subscription",
      "type": "revenue",
      "amount": 15000,
      "description": "Monthly subscriptions"
    }
  ]
}
```

---

## Fase 4: Melhorias Frontend (OPCIONAL)

### 4.1 Lock campos fixos em ColumnManager

**Arquivo:** `apps/admin-web/src/components/table/ColumnManager.tsx`

```typescript
const lockedFields = ['name', 'cpfCnpj', 'plan', 'status'];

// Na coluna de checkbox:
disabled={lockedFields.includes(column.id)}
// Mostrar tooltip "This field cannot be hidden"
```

---

### 4.2 Indicador visual de colunas fixas

```tsx
<div className="flex items-center gap-2">
  {lockedFields.includes(column.id) && (
    <Lock size={14} className="text-red-500" />
  )}
  {column.label}
</div>
```

---

## Priorização

```
┌─────────────────────────────────────────────┐
│ CRÍTICO (Session 10)                        │
├─────────────────────────────────────────────┤
│ 1. Persistência columnOrder via API         │
│ 2. Validação audit (sem custom-fields)      │
│ 3. Testar drag&drop com persistência        │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ IMPORTANTE (Session 10-11)                  │
├─────────────────────────────────────────────┤
│ 4. Implementar API /payments                │
│ 5. Implementar API /dre                     │
│ 6. Conectar PaymentsPage ao backend         │
│ 7. Conectar DREPage ao backend              │
│ 8. Validação email/phone em Companies       │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ OPCIONAL (Session 11+)                      │
├─────────────────────────────────────────────┤
│ 9. Lock campos fixos em ColumnManager       │
│ 10. Validação no formulário de Companies    │
│ 11. Cache de Views no frontend              │
└─────────────────────────────────────────────┘
```

---

## Checklist de Validação

### Antes de começar Session 10:

```
□ Build frontend sem erros
  npm run build (admin-web)
  
□ Código de exemplo pronto
  apps/admin-web/src/pages/CompaniesPage.tsx linha 89
  
□ TODO destacado no código
  grep -n "TODO: Backend persistence" apps/admin-web/src/pages/CompaniesPage.tsx
  
□ Documentação disponível
  ADMIN_CONSOLE_UPDATES.md seção 3.2 (Views API)
  
□ Banco de testes limpo
  Executar migrations mais recentes
  
□ Postman/curl pronto
  Testar PATCH /api/views/:id com columnOrder
```

---

## Comando Rápido para Começar

```bash
# Session 10 setup
cd c:\Users\roger\Documents\CRM-PRO-DEV

# 1. Verificar build
cd apps/admin-web && pnpm vite build

# 2. Verificar TODO
grep -rn "TODO" src/pages/

# 3. Ler documentação
cat ../../ADMIN_CONSOLE_UPDATES.md | grep -A 20 "Views API"

# 4. Começar implementação
# → Backend: crm-backend/src/modules/views/
```

---

## Referência Rápida de Arquivos

| Arquivo | Linha | Ação |
|---------|-------|------|
| CompaniesPage.tsx | 89 | Remover TODO, chamar API |
| EmployeesPage.tsx | 78 | Remover TODO, chamar API |
| AuditPage.tsx | 87 | Remover TODO, chamar API |
| views.controller.ts | - | Criar método PATCH |
| schema.prisma | - | Adicionar columnOrder field |
| views.service.ts | - | Implementar update logic |

---

**Documento criado:** 2026-02-04
**Validação:** Session 9 completa
**Status:** ✅ Pronto para Session 10

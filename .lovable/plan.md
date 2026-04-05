

## Plan: Apply Granular Permissions Within Pages

### Problem
Currently, permissions only work at the **route level** (controlling page access) and **sidebar visibility**. Once a user can access a page, they can perform ALL actions (create, edit, delete) regardless of their role's configured permissions. The granular permissions (e.g., `produtos.create`, `clientes.delete`, `estoque.edit`) exist in the database but are not enforced within the pages.

### Solution
Add `hasPermission` checks inside each page to show/hide or enable/disable action buttons (create, edit, delete, manage) based on the user's role permissions.

### Changes by File

**1. `src/pages/Produtos.tsx`**
- Import `useAuth` and call `hasPermission`
- Hide "Novo Produto" button if no `produtos.create` permission
- Hide edit button per product if no `produtos.edit`
- Hide delete button per product if no `produtos.delete`
- Hide "Tipos" button if no `produtos.create` (manage types = create-level)

**2. `src/pages/Clientes.tsx`**
- Import `useAuth` and call `hasPermission`
- Hide "Novo Cliente" button if no `clientes.create`
- Hide edit button if no `clientes.edit`
- Hide delete button if no `clientes.delete`

**3. `src/pages/PDV.tsx`**
- Already imports `useAuth`
- Check `pdv.sell` permission before allowing sale finalization
- If no `pdv.sell`, disable the "Finalizar Venda" button and show tooltip

**4. `src/pages/Vendas.tsx`**
- Import `useAuth` and call `hasPermission`
- Check `vendas.create` is not needed here (sales are created via PDV)
- No action buttons to hide currently (view-only page with cancel in detail dialog)

**5. `src/components/VendaDetailDialog.tsx`**
- Already imports `useAuth`
- Hide "Cancelar Venda" button if no `vendas.create` permission (or add a specific cancel permission check)

**6. `src/pages/Estoque.tsx`**
- Import `useAuth` and call `hasPermission`
- Hide edit/adjustment actions if no `estoque.edit`

**7. `src/pages/Caixa.tsx`**
- Already imports `useAuth`
- Hide open/close/manage buttons if no `caixa.manage`
- Keep view capabilities for `caixa.view`

**8. `src/pages/Malas.tsx`**
- Import `useAuth` and call `hasPermission`
- Hide manage actions if no `malas.manage`

**9. `src/pages/Funcionarios.tsx`**
- Already imports `useAuth` (uses `isAdmin`)
- Replace `isAdmin` checks with `hasPermission('funcionarios', 'create')` and `hasPermission('funcionarios', 'edit')` where appropriate
- Hide "Novo Funcionário" if no `funcionarios.create`
- Hide edit/delete buttons if no `funcionarios.edit`

### Pattern
Each page will follow this consistent pattern:
```tsx
const { hasPermission } = useAuth();
const canCreate = hasPermission('module', 'create');
const canEdit = hasPermission('module', 'edit');
const canDelete = hasPermission('module', 'delete');

// Then conditionally render buttons:
{canCreate && <Button>Novo</Button>}
{canEdit && <Button><Pencil /></Button>}
{canDelete && <Button><Trash2 /></Button>}
```

### No Database Changes
All permissions already exist in the database. This is purely a frontend enforcement task.


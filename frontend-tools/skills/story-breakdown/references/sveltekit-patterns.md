# SvelteKit Patterns (Yond Management)

## Project Structure

```
src/
├── routes/app/          # Staff routes
├── routes/self-service/ # Customer self-service portal
├── lib/
│   ├── components/      # Atomic design hierarchy
│   │   ├── atoms/       # Basic UI elements
│   │   ├── molecules/   # Composed components
│   │   └── organisms/   # Complex components
│   ├── api/services/    # Svelte Query wrappers
│   ├── formSchemas/     # Zod validation schemas
│   ├── stores/          # Svelte stores
│   └── generated/api.ts # Auto-generated types
└── e2e/                 # Playwright tests
```

## Component Patterns

### Naming Conventions

| Prefix | Purpose | Example |
|--------|---------|---------|
| Y- | Form-integrated | YTextField, YForm, YSelect |
| Meltui- | Melt UI wrappers | MeltuiDialog, MeltuiDropdown |
| -Cell | Table cell renderers | TextCell, DateCell, ActionCell |

### Form Development

1. Define Zod schema in `src/lib/formSchemas/`
2. Use `YForm` wrapper component
3. Integrate Y-prefixed field components
4. Handle submission with `createMutation`

```svelte
<YForm {form} onSubmit={handleSubmit}>
  <YTextField {form} name="email" label="Email" />
  <YSelect {form} name="role" options={roleOptions} />
</YForm>
```

### Table Implementation

- Use `TableGrid.svelte` wrapper
- Define columns with `TableColumn` type
- Implement server-side pagination
- Add mobile-specific cells when needed

## API Patterns

### Service Layer

```typescript
// Query (GET)
createGetQuery(apiClient.endpoint, 'cache-key');

// Mutation (POST/PUT/DELETE)
createMutation(apiClient.endpoint, {
  onSuccess: () => queryClient.invalidateQueries(['cache-key'])
});
```

### DateTime Handling

- Fields ending in `_dt`, `_date`, `_ts` auto-convert
- Use Luxon DateTime objects throughout
- UTC conversion handled by interceptors

## Testing Patterns

### E2E Test Structure

```
e2e/
├── staff_user/          # Staff portal tests
│   ├── customer/        # Customer management
│   ├── finance/         # Financial features
│   └── calendar/        # Scheduling
└── customer_user/       # Self-service tests
```

### Test Pattern

```typescript
test('should [action]', async ({ page }) => {
  // Arrange
  await page.goto('/app/feature');

  // Act
  await page.getByRole('button', { name: 'Submit' }).click();

  // Assert
  await expect(page.getByText('Success')).toBeVisible();
});
```

### Preferred Locators

1. `getByRole` - semantic, accessible
2. `getByLabel` - form fields
3. `getByTestId` - complex components
4. `getByText` - visible content

## State Management

| Scope | Solution |
|-------|----------|
| Local | Component `let` variables |
| Shared | Svelte stores in `src/lib/stores/` |
| Server | Svelte Query cache |
| Form | sveltekit-superforms |

## Common Atomic Levels

| Level | Examples |
|-------|----------|
| Atom | Button, Input, Label, Icon |
| Molecule | TextField, SearchInput, Card |
| Organism | DataTable, Calendar, Form |
| Template | PageLayout, SidebarLayout |
| Page | Route components |

# Formula Studio architecture

The renderer follows a small layered structure:

```text
src/
├── components/          Reusable visual controls
│   ├── common/          Generic form inputs
│   ├── modals/          Shared application dialogs
│   └── tags/            Tag and group controls
├── features/            Feature-specific screens and workflows
│   ├── formulas/        Formula library, reader, editor sections, and blending
│   └── materials/       Material library and material editing
├── domain/              Perfume-formulation data and pure helpers
│   ├── models.ts        Shared domain types
│   ├── formula.ts       Formula, version, date, and tag helpers
│   └── fixtures.ts      Initial demonstration data and defaults
├── services/            Browser and platform adapters
│   └── localStore.ts    Local-storage persistence
├── StudioClient.tsx     Application state and feature composition
├── main.tsx             React entry point
└── styles.css           Application styles
```

## Dependency direction

- Components may import domain types and helpers.
- Services may import domain types, but never React components.
- Domain modules must remain independent of React and persistence.
- `StudioClient.tsx` composes feature modules and coordinates application-level state; feature UI belongs under `features/`.

## Adding functionality

- Add or change a business data shape in `domain/models.ts`.
- Put deterministic formula calculations in `domain/formula.ts` or a focused domain module.
- Put storage, file, or future cloud access behind `services/`.
- Put reusable UI in a focused folder under `components/`.
- Keep `StudioClient.tsx` responsible for orchestration rather than low-level implementation.

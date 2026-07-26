# Formula Studio Backup File Specification

Status: normative interoperability contract  
Format version: `1`  
Canonical application name: `调香手记`

## 1. Purpose

This document defines the JSON backup format shared by the Formula Studio desktop application and the Site version. A conforming Site implementation MUST be able to export a backup that the current desktop application can import, and MUST be able to import backups produced by the desktop application.

The backup contains the complete user-owned local data store: formulas, materials, groups, and settings. It is a full snapshot, not an incremental update.

Normative words such as MUST, MUST NOT, SHOULD, and MAY indicate implementation requirements.

## 2. File requirements

- Encoding MUST be UTF-8.
- The content MUST be valid JSON with no comments or trailing commas.
- The filename SHOULD be `调香手记-本地备份-YYYY-MM-DD.json`, using the user's local calendar date.
- The download MIME type SHOULD be `application/json;charset=utf-8`.
- Numbers MUST be finite JSON numbers. `NaN`, `Infinity`, and numeric strings are not substitutes for numeric fields.
- Property names and enum values are case-sensitive.
- An export MUST include all four data arrays, including arrays that are empty.

## 3. Canonical top-level envelope

A newly exported backup MUST have this shape:

```json
{
  "app": "调香手记",
  "version": 1,
  "syncRevision": 12,
  "exportedAt": "2026-07-27T08:30:00.000Z",
  "data": {
    "formulas": [],
    "materials": [],
    "groups": [],
    "settings": []
  }
}
```

Top-level fields:

| Field | Type | Requirement |
| --- | --- | --- |
| `app` | string | MUST equal `调香手记`. |
| `version` | integer | MUST equal `1` for this specification. This is the backup format version, not the app release version. |
| `syncRevision` | integer | Monotonic synchronization revision ID. Desktop sync exports MUST include it. Legacy version 1 files without it are treated as revision `0`. |
| `exportedAt` | string | MUST be a valid ISO 8601 UTC timestamp produced by `new Date().toISOString()`. |
| `data` | object | MUST contain `formulas`, `materials`, `groups`, and `settings`. |

Importers SHOULD ignore unknown properties so future application releases can add data without breaking version 1 readers.

## 4. Data model

### 4.1 `data.formulas`

An array of formula records. Each record has these fields:

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `id` | string | yes | Non-empty and unique among formulas. |
| `name` | string | yes | Formula display name. |
| `version` | string | yes | Version label, currently normally semantic-version-like, such as `2.1.0`. |
| `created` | string | yes | Date string, normally `YYYY-MM-DD`. |
| `measure` | string | yes | Exactly `mass` or `volume`. |
| `concentration` | number | yes | Finite number. |
| `fragrance` | number | yes | Finite number. |
| `solvent` | number | yes | Finite number. |
| `solventType` | string | yes | May be empty. |
| `use` | string | yes | Exactly `香水`, `香薰`, or `香基`. |
| `notes` | string | yes | May be empty. |
| `ingredients` | object | yes | MUST contain the three arrays `top`, `heart`, and `base`. |
| `evaluation` | object | no | See section 4.3. |
| `adjustmentStep` | number | no | Finite number. |
| `groupId` | string | no | Legacy single-group reference; importers MUST preserve it when present. |
| `tagIds` | string[] | no | Group/tag references; every element MUST be a string. |

Each ingredient in `ingredients.top`, `ingredients.heart`, or `ingredients.base` has:

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `id` | string | yes | Non-empty and unique within its formula. |
| `name` | string | yes | Ingredient display name. |
| `materialId` | string | no | References a material ID when linked. An unresolvable ID SHOULD be preserved, not deleted. |
| `ratio` | number | yes | Finite number. |
| `amount` | number | yes | Finite number. |

### 4.2 `data.materials`

An array of material records:

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `id` | string | yes | Non-empty and unique among materials. |
| `cn` | string | yes | Chinese/display name; may be empty. |
| `en` | string | yes | English/secondary name; may be empty. |
| `note` | string | yes | Exactly `top`, `heart`, or `base`. |
| `diluted` | boolean | yes | Whether the material is diluted. |
| `solvent` | string | yes | May be empty. |
| `concentration` | string | yes | Stored as a string for compatibility; may be empty. |
| `materialType` | string | no | Exactly `synthetic`, `natural`, or `accord`. |
| `vaporPressure` | string | no | Stored as a string. |
| `groupId` | string | no | Legacy single-group reference; preserve when present. |
| `tagIds` | string[] | no | Group/tag references. |
| `createdAt` | string | no | Date/timestamp string. |
| `latinName` | string | no | Legacy field; preserve when present. |
| `cas` | string | no | Legacy field; preserve when present. |
| `supplier` | string | no | Legacy field; preserve when present. |
| `referenceUrl` | string | no | Legacy field; preserve when present. |

### 4.3 Formula evaluation

When `formula.evaluation` is present, it MUST contain:

| Field | Type |
| --- | --- |
| `testedAt` | string |
| `restDays` | number |
| `projection` | number |
| `sillage` | number |
| `longevity` | number |
| `opening` | string |
| `heart` | string |
| `drydown` | string |
| `nextStep` | string |

All numeric fields MUST be finite.

### 4.4 `data.groups`

An array of group/tag records:

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `id` | string | yes | Non-empty and unique among groups. |
| `name` | string | yes | Display name. |
| `kind` | string | yes | Exactly `formula` or `material`. |

References in a formula SHOULD point only to groups whose `kind` is `formula`. References in a material SHOULD point only to groups whose `kind` is `material`.

### 4.5 `data.settings`

An array of settings records. Version 1 defines the vapor lookup setting:

```json
{
  "id": "vapor_lookup",
  "sources": [
    {
      "id": "zoteq",
      "name": "Zoteq",
      "url": "https://www.zoteq.com/"
    }
  ],
  "broadSearch": false
}
```

Rules:

- `id` MUST equal `vapor_lookup`.
- `sources` MUST be an array.
- Each source MUST contain string fields `id`, `name`, and `url`.
- `broadSearch` MUST be a boolean.
- Importers SHOULD preserve unknown settings records for forward compatibility, provided they are JSON objects.

## 5. Complete example

```json
{
  "app": "调香手记",
  "version": 1,
  "syncRevision": 12,
  "exportedAt": "2026-07-27T08:30:00.000Z",
  "data": {
    "formulas": [
      {
        "id": "f1",
        "name": "雨后白茶",
        "version": "1.0.0",
        "created": "2026-07-27",
        "measure": "mass",
        "concentration": 20,
        "fragrance": 10,
        "solvent": 40,
        "solventType": "无水乙醇",
        "use": "香水",
        "notes": "静置两周后评估。",
        "tagIds": ["g1"],
        "ingredients": {
          "top": [
            {
              "id": "i1",
              "name": "佛手柑",
              "materialId": "m1",
              "ratio": 100,
              "amount": 10000
            }
          ],
          "heart": [],
          "base": []
        }
      }
    ],
    "materials": [
      {
        "id": "m1",
        "cn": "佛手柑",
        "en": "Bergamot",
        "note": "top",
        "diluted": false,
        "solvent": "",
        "concentration": "",
        "materialType": "natural",
        "tagIds": []
      }
    ],
    "groups": [
      {
        "id": "g1",
        "name": "柑橘",
        "kind": "formula"
      }
    ],
    "settings": []
  }
}
```

## 6. Export requirements for the Site version

An export feature is conforming only if it performs all of the following:

1. Read the complete, latest persisted Site data store at the moment the user clicks Export. Do not export stale React state if a save is still pending; flush or await pending writes first.
2. Export user-owned persisted records only. Demo/sample records shown as an empty-state fallback MUST NOT be exported unless the user explicitly saved them.
3. Deep-copy the store into the canonical envelope from section 3. Do not mutate application state while exporting.
4. Preserve Unicode text and all recognized optional and legacy fields. Do not omit empty top-level arrays.
5. Serialize with `JSON.stringify(envelope, null, 2)`.
6. Create a UTF-8 JSON `Blob`, generate an object URL, trigger a browser download with the required filename pattern, and revoke the object URL after the click has been dispatched.
7. Report an error to the user if reading, serializing, or initiating the download fails. Never show a success message before the download has been initiated.

Reference browser implementation:

```ts
type GuestStore = {
  formulas: Formula[];
  materials: Material[];
  groups: Group[];
  settings: unknown[];
};

async function exportBackup(): Promise<void> {
  await flushPendingWrites();
  const store: GuestStore = await readPersistedStore();

  const envelope = {
    app: "调香手记",
    version: 1,
    syncRevision: await readCurrentSyncRevision(),
    exportedAt: new Date().toISOString(),
    data: {
      formulas: [...store.formulas],
      materials: [...store.materials],
      groups: [...store.groups],
      settings: [...store.settings]
    }
  };

  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const localDate = new Date().toLocaleDateString("en-CA");

  anchor.href = url;
  anchor.download = `调香手记-本地备份-${localDate}.json`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
```

`readPersistedStore()` and `flushPendingWrites()` are placeholders that MUST be connected to the Site's actual persistence layer (for example IndexedDB or local storage). Returning hard-coded arrays, demo fixtures, or only the currently visible record is not a valid implementation.

`version` and `syncRevision` MUST NOT be confused. `version` changes only when the backup schema changes. `syncRevision` increases after a local data mutation and is used to detect synchronization conflicts. When the remote revision is higher, the application MUST ask the user whether to preserve the local or remote data before overwriting either copy. Preserving local data MUST assign it a revision greater than the remote revision before upload.

## 7. Import requirements for the Site version

The importer MUST:

1. Let the user select a `.json` file and read it as UTF-8 text.
2. Parse the text with `JSON.parse`; parsing errors MUST NOT alter existing data.
3. Accept the canonical envelope (`parsed.data`) and, for compatibility with older files, a legacy raw store whose root directly contains the four arrays.
4. For an envelope, require `app === "调香手记"`, require integer `version`, and reject versions greater than `1` with an understandable unsupported-version message. A legacy raw store has no envelope metadata.
5. Validate the store and nested record types described in section 4 before writing anything. At minimum, reject a file when the store is not an object, any of the four required collections is not an array, a required record field has the wrong type, an enum is invalid, or a numeric field is not finite.
6. Display a pre-import summary with formula, material, group, and setting counts and state clearly that import replaces the current local data.
7. Require explicit user confirmation.
8. Replace all four collections as one atomic operation. If validation or persistence fails, retain the entire previous store.
9. Reload application state from the newly persisted store and display success only after persistence succeeds.

Import MUST preserve empty arrays. It MUST NOT silently replace an intentionally empty imported collection with demo records. The desktop application's current display fallback may show demo data after an empty import, but that behavior is not part of the backup file format and SHOULD be corrected independently.

## 8. Replacement semantics and safety

- Import is full replacement, not merge.
- Export is read-only and MUST NOT change IDs, dates, computed values, or ordering.
- The order of every array SHOULD be preserved.
- Importers MUST NOT fetch URLs found in a backup while importing.
- Backup text MUST be treated as data, never as HTML or executable code.
- A Site SHOULD impose a documented file-size limit and reject oversized files before parsing. A practical default is 25 MB.
- Before replacing data, a Site MAY offer an automatic pre-import backup of the current store.

## 9. Compatibility matrix

| Operation | Required |
| --- | --- |
| Desktop v1 export -> Site import | yes |
| Site v1 export -> desktop current import | yes |
| Legacy raw-store JSON -> Site import | yes |
| Site export without envelope | no; new exports MUST use the envelope |
| Import a future envelope version greater than 1 | reject without changing data |
| Preserve unknown object properties in known records | SHOULD |

The current desktop importer chooses `parsed.data` whenever a top-level `data` property exists and otherwise treats the root as the store. Therefore, Site exports MUST use the exact `data` property and the four exact collection names specified above.

## 10. Acceptance tests

A Site export/import implementation is complete only when these tests pass:

1. Export a populated Site store, import it into the desktop app, and confirm counts and record contents match.
2. Export from desktop, import into the Site, then re-export and compare all `data` values (ignoring envelope `exportedAt` and harmless JSON property ordering).
3. Export a store where all four arrays are empty; confirm the file contains four empty arrays and no demo fixtures.
4. Verify Chinese, English, emoji, quotes, backslashes, and multiline notes survive a desktop -> Site -> desktop round trip.
5. Verify optional evaluation, material metadata, group references, settings, and legacy material fields survive a round trip.
6. Attempt malformed JSON, an unsupported version, missing arrays, invalid enums, non-finite/wrong-type numeric values, and duplicate primary IDs; each MUST be rejected without modifying existing data.
7. Cancel at the confirmation dialog; existing data MUST remain unchanged.
8. Simulate a persistence failure during import; the previous complete store MUST remain available.
9. Make a change immediately before export; the downloaded backup MUST contain that latest change.
10. Confirm importing a valid file replaces all four collections rather than merging them.

## 11. Source of truth

For format version 1, this document is the cross-platform interchange contract. TypeScript types may be generated from it, but desktop and Site implementations MUST not independently invent field names or change field types. Any breaking format change requires a new integer `version` and a documented migration path.

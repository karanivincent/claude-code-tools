# Design Specification Output Template

Use this structure for the Design Specification section in story breakdowns.

---

## Design Specification

### Designer Notes

| Note | Source |
|------|--------|
| [Verbatim behavior spec from Figma annotation] | [Annotation frame title] |

Notes are extracted from "Note" or "Note V2" frames in the Figma section. They contain
behavior specs, interaction rules, and constraints from the designer. These feed directly
into acceptance criteria and test scenarios.

### Component Token Table

#### [Section Name]

| Property | Figma Token | Project Class |
|----------|------------|---------------|
| Typography | Yond-CSS/M-16/Bold | `yond-text-m-bold` |
| Text color | Text/Toned/text-accent-bold | `text-toned-accent-bold` |
| Background | Surface/bg-card | `bg-surface-card` |
| Spacing | Spacing/4 (16px) | `p-4` |
| Border | Border/stroke-static | `border-stroke-static` |
| Shadow | Shadow/Card | `yond-shadow-card` |
| Radius | radius/md | `rounded-md` |

One sub-section per visual area (Hero Image, Trainer Row, CTA, etc.).
Only include properties explicitly set in the design.

### Icon Inventory

| Location | Icon data-name | Component Import |
|----------|---------------|-----------------|
| [Where in the UI] | `map-pin` | `IconMapPin` |

### State Matrix

| Element | Default | Booked | [Variant N] |
|---------|---------|--------|-------------|
| Status text | "95/100 free" | "Booked" | ... |
| CTA label | "Book" | "Cancel booking" | ... |

Only include rows where values change between variants.

### Layout Measurements

| Section | Spacing | Project Class |
|---------|---------|---------------|
| Content padding | 12px | `px-3` |
| Section gap | 16px | `gap-4` |

### Screenshots

[get_screenshot output for each variant state]

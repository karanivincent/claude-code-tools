# Epic Issue Template

Use this structure for parent issues that coordinate multiple child tasks.

```markdown
# 🎯 <Epic Title>

## Summary

<1-2 sentence description of the feature/epic>

## Dependency Tree

- [ ] #<n> <Setup task>
      └── [ ] #<n> <Slice 1>
          ├── [ ] #<n> <Slice 2>
          ├── [ ] #<n> <Slice 3>
          └── [ ] #<n> <Slice 4>
      └── [ ] #<n> <Final integration>

## Progress

🟡 In Progress | 0/<total> complete
```

## Automatic Updates

When a child issue is completed:
1. Check off the item in the dependency tree
2. Update the progress count
3. If all children done, mark epic as `ready-for-review`

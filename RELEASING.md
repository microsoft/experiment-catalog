# Releasing New Versions

This project uses [Semantic Versioning](https://semver.org/) for container image releases.

## Version Format

Versions follow the `{major}.{minor}.{patch}` format:

| Component | When to Increment                                         | Example           |
| --------- | --------------------------------------------------------- | ----------------- |
| **Major** | Breaking changes that require users to modify their setup | `1.0.0` → `2.0.0` |
| **Minor** | New features that are backward-compatible                 | `1.0.0` → `1.1.0` |
| **Patch** | Bug fixes that are backward-compatible                    | `1.0.0` → `1.0.1` |

## How to Release

1. **Ensure all changes are merged to `main`**

2. **Create and push a version tag:**

   ```bash
   # Replace X.Y.Z with your version number
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

3. **The CI/CD pipeline will automatically:**
   - Build the container image for `linux/amd64` and `linux/arm64`
   - Push to GitHub Container Registry with appropriate tags

## Image Tags Generated

When you push a tag like `v1.2.3`, the following image tags are created:

| Tag           | Description                         | Use Case                                   |
| ------------- | ----------------------------------- | ------------------------------------------ |
| `1.2.3`       | Exact version                       | Production deployments requiring stability |
| `1.2`         | Latest patch for this minor version | Get automatic bug fixes                    |
| `sha-abc1234` | Git commit SHA                      | Debugging, traceability                    |

Additionally, pushes to `main` create:

| Tag    | Description             | Use Case            |
| ------ | ----------------------- | ------------------- |
| `main` | Latest from main branch | Development/testing |

## Pulling Images

Images are published to GitHub Container Registry:

```bash
# Pull a specific version
docker pull ghcr.io/<owner>/experiment-catalog/catalog:1.2.3

# Pull latest patch for a minor version
docker pull ghcr.io/<owner>/experiment-catalog/catalog:1.2

# Pull latest from main branch
docker pull ghcr.io/<owner>/experiment-catalog/catalog:main
```

## Best Practices

1. **Always test on `main` first** - The `main` tag reflects the latest merged code
2. **Use exact versions in production** - Pin to `1.2.3` rather than `1.2` for predictable deployments
3. **Document breaking changes** - Update the README or CHANGELOG when incrementing the major version
4. **Don't delete tags** - Users may depend on specific versions

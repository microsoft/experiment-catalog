# Releasing New Versions

This project uses [Semantic Versioning](https://semver.org/) for releases. Merging to `main` and releasing a version are intentionally separate actions.

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

3. **The release pipeline will automatically:**
   - Build the container image for `linux/amd64` and `linux/arm64`
   - Push to GitHub Container Registry with appropriate tags
   - Create or update the GitHub release
   - Attach release artifacts that record the version, commit, image tags, and image digest

## Image Tags Generated

When you push a tag like `v1.2.3`, the following image tags are created:

| Tag           | Description                         | Use Case                                   |
| ------------- | ----------------------------------- | ------------------------------------------ |
| `1.2.3`       | Exact version                       | Production deployments requiring stability |
| `1.2`         | Latest patch for this minor version | Get automatic bug fixes                    |
| `sha-abc1234` | Git commit SHA                      | Debugging, traceability                    |

Pushes to `main` validate that the container image still builds, but they do not publish a `main` image and do not create a release.

## Pulling Images

Images are published to GitHub Container Registry:

```bash
# Pull a specific version
docker pull ghcr.io/<owner>/experiment-catalog/catalog:1.2.3

# Pull latest patch for a minor version
docker pull ghcr.io/<owner>/experiment-catalog/catalog:1.2

```

## Best Practices

1. **Always validate on `main` first** - The `main` branch reflects the latest merged code, but it is not a published release
2. **Use exact versions in production** - Pin to `1.2.3` rather than `1.2` for predictable deployments
3. **Document breaking changes** - Update the README or CHANGELOG when incrementing the major version
4. **Don't delete tags** - Users may depend on specific versions

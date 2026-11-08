# CI/CD and production deployment

The GitHub Actions pipeline runs four stages:

| Stage | Trigger | Checks / output |
| --- | --- | --- |
| Test | PRs to main, pushes to main, v* tags, manual runs | Separate unit and integration jobs for Go and React |
| Build | Both test jobs pass | TypeScript/Vite build and static Linux amd64 Go binary, archived together with checksums |
| Deploy | Successful main push only | Deploy the build artifact to the `prod` environment |
| Release | Successful vMAJOR.MINOR.PATCH tag push only | GitHub Release with archive, checksums, generated notes |

Tags must identify commits reachable from main. Tags do not deploy; main pushes do not create releases. Manual runs execute tests/build only. Deployment and release consume the artifact from their own run; neither rebuilds it. Only release has repository write permissions. PR jobs have no production credentials.

## Local checks

```sh
cd server
go test -race -count=1 ./...
go test -race -count=1 -tags=integration ./internal/api
go vet ./...
```

```sh
cd web
npm ci
npm run test:unit
npm run test:integration
npm run build
```

Go integration tests connect local HTTP fixture providers to the actual Fetch/parser/cache/API components. They test filtering, truncation, source status, stale-cache preservation, health, and invalid inputs. React integration tests mount the actual App with Query and Zustand, substitute HTTP responses, and exercise event selection and filter requests. They mock the WebGL scene; they do not validate rendering or touch gestures. No test requires live earthquake providers.

## Production target: Linux over SSH

The included scripts target a Linux amd64 server with systemd, nginx, bash, curl, tar, GNU coreutils, util-linux (`flock`), and OpenSSH. They use port 22 and `/opt/quakescope`. They do not provision a server, DNS, or TLS. The deployment runs on pushes to main.

On the server, an administrator must:

1. Create a deployment user with SSH access, and a `quakescope` service user.
2. Create `/opt/quakescope/releases`, owned by the deployment user, readable/traversable by nginx and the service user.
3. Install `quakescope.service` into `/etc/systemd/system/`, then run `sudo systemctl daemon-reload` and `sudo systemctl enable quakescope`. The first deployment creates the executable before starting it.
4. Allow the deployment user passwordless sudo for **only** the exact `systemctl restart quakescope` and `systemctl stop quakescope` commands (use the host's absolute systemctl path in sudoers).
5. Install the nginx example, replace its domain, enable the site, and configure TLS. The nginx user must be able to read `/opt/quakescope/current/web`.

Create a GitHub environment named `prod`. Restrict deployment branches to `main`, and add these environment secrets:

| Secret | Value |
| --- | --- |
| `PROD_HOST` | Server DNS name or IPv4 address |
| `PROD_USER` | SSH deployment account |
| `PROD_SSH_KEY` | Private key authorized for that account |
| `PROD_KNOWN_HOSTS` | Verified known_hosts entry for the server |

Verify the SSH host fingerprint independently before storing it; the workflow enforces host-key checks. Credentials are intentionally absent from source. Missing secrets fail deployment with a specific error; they do not produce a fake success. Configuring them activates deployment on subsequent main pushes. Recommended repository protection: require both test jobs and Build before merging.

The deployment script verifies checksums locally and remotely, extracts into a commit-specific release directory, switches `current` atomically, restarts systemd, and polls the API health endpoint. Failed activation attempts to restore the previous release and reports failure. This is a single-server rollout with a short API restart, not zero downtime. Health checks validate the backend process, not provider synchronization or the public TLS route. Old releases remain available for manual rollback; archive retention and disk cleanup are operator responsibilities. Existing browser sessions may need a refresh after assets change.

## Publish a release

After the desired commit is merged into main:

```sh
git switch main
git pull --ff-only
git tag -a v0.1.0 -m 'QuakeScope v0.1.0'
git push origin v0.1.0
```

The pipeline reruns tests and builds the tagged revision before creating its GitHub Release. No release is created by PRs, branch pushes, manual dispatch, or deploy completion. Reusing an existing release tag is intentionally not an overwrite operation; publish a new version for new contents.

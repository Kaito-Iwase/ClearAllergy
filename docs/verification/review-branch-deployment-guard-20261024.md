# Review branches: automatic deployment disabled

The three exact nonproduction branches listed in root vercel.json have git.deploymentEnabled=false. No wildcard or global disable is used. Unspecified branches, including main and develop, keep Vercel's documented default=true. This does not change project settings, secrets, production branch selection, CI triggers or runtime behavior.

Official specification checked before push: https://vercel.com/docs/project-configuration/git-configuration . The property controls automatic Git deployments; no ignored-build command, skip-ci commit convention or post-start cancellation is relied upon. Preview DB/Clerk/Blob separation remains unverified, so no preview is requested. GitHub Actions remains enabled and uses disposable PostgreSQL and placeholder auth credentials; the workflows contain no deploy step or production secret reference.

Keep the branch entries while reviewing these changes. Do not enable a deployment or merge as part of this task. Any later removal or preview must separately confirm nonproduction connections.

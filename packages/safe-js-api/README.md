# Safe JS API

Types and helper functions for integrating with the [Safe JS](https://github.com/mProjectsCode/obsidian-safe-js-plugin) Obsidian plugin.

```sh
bun add -d @lemons_dev/obsidian-safe-js-api
```

```ts
import { getSafeJsApi } from '@lemons_dev/obsidian-safe-js-api';
import type { SafeJsCallerApi } from '@lemons_dev/obsidian-safe-js-api';

const safeJsApi: SafeJsCallerApi | undefined = getSafeJsApi(this.app, this);
```

This package does not augment Obsidian's global typings. It exports explicit integration types and small runtime helpers only.

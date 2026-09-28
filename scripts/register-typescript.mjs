// Resolve the application's TypeScript and @/ imports for Node's integration tests.
import { register } from 'node:module';
register('./typescript-loader.mjs', import.meta.url);

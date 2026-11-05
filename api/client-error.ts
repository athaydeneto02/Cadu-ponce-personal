import { createServerClient } from '../server/security.js';
import { createClientErrorHandler } from '../server/clientError.js';

export default createClientErrorHandler(createServerClient, event => console.error(JSON.stringify(event)));

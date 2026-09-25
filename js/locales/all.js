// Every translation at once, for the server (the browser loads only the
// language it shows: i18n.js loadDictionary)

import { addDictionary } from '../i18n.js';
import fr from './fr.js';
import es from './es.js';

addDictionary('fr', fr);
addDictionary('es', es);

import { registerOfflineCatalogRegression } from './masterCatalogRegression'
import { rc31Fixture } from '../rc31Fixture'
import { rc31Catalog } from '../../src/data/rc31Catalog'
registerOfflineCatalogRegression(31, rc31Fixture, rc31Catalog, false)

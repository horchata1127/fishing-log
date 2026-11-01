import { registerOfflineCatalogRegression } from './masterCatalogRegression'
import { rc31Fixture } from '../rc31Fixture'
import { rc33Catalog } from '../../src/data/rc33Catalog'
registerOfflineCatalogRegression(33, rc31Fixture, rc33Catalog, true)

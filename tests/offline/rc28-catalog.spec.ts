import { registerOfflineCatalogRegression } from './masterCatalogRegression'
import { rc28Fixture } from '../rc28Fixture'
import { rc28Catalog } from '../../src/data/rc28Catalog'
registerOfflineCatalogRegression(28, rc28Fixture, rc28Catalog, false)

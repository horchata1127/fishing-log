import { registerCatalogRegression } from './masterCatalogRegression'
import { rc31Fixture } from '../rc31Fixture'
import { rc31Catalog } from '../../src/data/rc31Catalog'
registerCatalogRegression(31, rc31Fixture, rc31Catalog, false)

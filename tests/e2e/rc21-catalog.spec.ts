import { registerCatalogRegression } from './masterCatalogRegression'
import { rc20Fixture } from '../rc20Fixture'
import { rc21Catalog } from '../../src/data/rc21Catalog'
registerCatalogRegression(21, rc20Fixture, rc21Catalog, false)

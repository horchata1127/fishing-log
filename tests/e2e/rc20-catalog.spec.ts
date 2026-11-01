import { registerCatalogRegression } from './masterCatalogRegression'
import { rc20Fixture } from '../rc20Fixture'
import { rc20Catalog } from '../../src/data/rc20Catalog'
registerCatalogRegression(20, rc20Fixture, rc20Catalog, false)

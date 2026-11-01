import { registerCatalogRegression } from './masterCatalogRegression'
import { rc22Fixture } from '../rc22Fixture'
import { rc22Catalog } from '../../src/data/rc22Catalog'
registerCatalogRegression(22, rc22Fixture, rc22Catalog, true)

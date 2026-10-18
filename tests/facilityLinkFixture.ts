import { timelineScenario } from './timelineFixture'
import { weatherTripId } from './weatherFixture'
export function facilityLinkScenario() {
  const fixture = timelineScenario(), trip = fixture.data.trips!.find(t => t.id === weatherTripId)
  trip.facilityId = undefined; trip.currentZoneId = undefined; trip.fishingAreaName = '日本イワナセンター'
  fixture.data.catches!.filter(c => c.tripId === weatherTripId).forEach((c,index) => {
    c.facilityId = undefined; c.zoneId = undefined; c.locationSnapshot = undefined
    c.memo = index < 2 ? '9号池' : 'ゼロ号池'
  })
  return fixture
}

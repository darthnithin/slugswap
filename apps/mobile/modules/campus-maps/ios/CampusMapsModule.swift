import CoreLocation
import ExpoModulesCore
import MapKit

public class CampusMapsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CampusMaps")

    AsyncFunction("openDirectionsAsync") {
      (name: String, latitude: Double, longitude: Double) -> Bool in
      let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
      let coordinate = CLLocationCoordinate2D(
        latitude: latitude,
        longitude: longitude
      )

      guard !trimmedName.isEmpty, CLLocationCoordinate2DIsValid(coordinate) else {
        return false
      }

      let destination = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
      destination.name = trimmedName

      return destination.openInMaps(launchOptions: [
        MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDefault
      ])
    }.runOnQueue(.main)
  }
}

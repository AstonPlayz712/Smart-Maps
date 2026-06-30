// engine/widgets/volumetric/index.ts
//
// Volumetric widget foundations, rendered through the Zante native renderer.

export {
  WeatherOrb,
  CalendarRing,
  NavigationRibbon,
  FlightWidget,
  ReminderStrips
} from './widgets';
export { sphere, ring, ribbon, box, transformYRotate } from './primitives';

import type { IWidgetHost, WidgetAnchor } from '../../../core/zante/native/widgets/IWidgetHost';
import {
  WeatherOrb,
  CalendarRing,
  NavigationRibbon,
  FlightWidget,
  ReminderStrips
} from './widgets';

/**
 * Mount the standard A/E widget cluster into a host with sensible default
 * anchors. Stage 2 re-anchors and binds these to live data.
 */
export function mountDefaultWidgets(host: IWidgetHost): void {
  const screen = (x: number, y: number): WidgetAnchor => ({ kind: 'screen', x, y });
  host.mount(new WeatherOrb(screen(0.12, 0.12)));
  host.mount(new CalendarRing(screen(0.88, 0.14)));
  host.mount(new NavigationRibbon({ kind: 'hud-slot', slot: 'nav-primary' }));
  host.mount(new FlightWidget(screen(0.85, 0.7)));
  host.mount(new ReminderStrips(screen(0.12, 0.7), 3));
}

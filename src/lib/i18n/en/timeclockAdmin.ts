import type { th } from "../th/timeclockAdmin";

export const en: typeof th = {
  saved: "Saved",
  saveFailed: "Save failed",
  loading: "Loading…",

  geoNotSupported: "This device does not support location",
  geoSetMsg: "Set coordinates for branch {branch} (accuracy ±{accuracy} m)",
  geoReadFailed: "Could not read location — allow the browser to use location first",
  radiusUpdatedMsg: "Updated radius for branch {branch}",

  sectionMenusTitle: "Menus enabled for staff",
  toggleExpiryLabel: "Expiry date check",
  toggleExpiryHint: "Off = this menu is hidden, not in today's checklist, and no warning count · items to return are still entered on the “Returns” page as usual",
  toggleStaffTimeLabel: "Time clock + schedule menu (staff)",
  toggleStaffTimeHint: "Off = staff don't see these 2 menus at all · admins can still see and test them anytime · turn on once accounts are created and everyone has registered their face",

  sectionTimeClockTitle: "Time clock (clock in/out)",
  toggleEnabledLabel: "Allow staff to clock in/out",
  toggleEnabledHint: "Off = staff can still register their face, but can't clock in/out",
  toggleRequireFaceLabel: "Require face scan",
  toggleRequireFaceHint: "If off, staff can clock in/out without a face photo — anyone could clock in for someone else. Not recommended to turn off",
  toggleRequireLocationLabel: "Require being within store radius",
  toggleRequireLocationHint: "The branch's coordinates must be set first, otherwise staff at that branch won't be able to clock in/out at all",

  sectionGeoTitle: "Store coordinates",
  geoSectionHint: "Press “Use current location” while standing at that branch · recommended radius 150 m to allow for indoor GPS drift (malls often report positions off by tens of meters)",
  geoSetBadge: "Set",
  geoNotSetBadge: "Not set",
  metersUnit: "meters",
  saveRadiusBtn: "Save radius",
  useHereBtn: "Use current location",

  footerNote: "If you're not at the store: open Google Maps at the store's location, long-press on the map to get coordinates, then send them to me and I'll enter them.",

  errBranchRequired: "Branch is required",
  errInvalidGeo: "Invalid coordinates",
};

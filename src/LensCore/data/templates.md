SPHERICAL
-----------------------

{
  coreId: "",
  displayName: "",
  manufacturer: "",
  replacement: "",
  type: {
    toric: false,
    multifocal: false,
  },
  parameters: {
    baseCurve: [],
    diameter: [],
    sphere: {
      segments: [],
      // exclude?: []
    },
  },
}

----------------------
TORIC
-----------------------

{
  coreId: "",
  displayName: "",
  manufacturer: "",
  replacement: "",
  type: {
    toric: true,
    multifocal: false,
  },
  parameters: {
    baseCurve: [],
    diameter: [],
    sphere: {
      segments: [],
    },
    toric: {
      groups: [
        {
          cylinders: [],
          axis: AXIS_PRESETS.full10,
        },
      ],
    },
  },
}

-----------
MF
-------------

{
  coreIid: "",
  displayName: "",
  manufacturer: "",
  replacement: "",
  type: {
    toric: false,
    multifocal: true,
  },
  parameters: {
    baseCurve: [],
    diameter: [],
    sphere: {
      segments: [],
    },
  },
}

-----------
TORIC MF
------------

{
  coreId: "",
  displayName: "",
  manufacturer: "",
  replacement: "",
  type: {
    toric: true,
    multifocal: true,
  },
  parameters: {
    baseCurve: [],
    diameter: [],
    sphere: {
      segments: [],
    },
    toric: {
      groups: [],
    },
  },
}
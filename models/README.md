# Retention Rig Model Files

This folder contains the 3D printable model files for the Maryland Pull-Out Device retention rig. These are the physical hardware components that pair with the Model Prep software.

**You are free to modify these files** to suit your specific testing needs. In the future, these components may be integrated directly into the software for automated assembly.

---

## Download Links

### Top Components (Shared)
| File | Description | Download |
|------|-------------|----------|
| `TopAttachment.stl` | Main top attachment | [Download](https://github.com/MaxeThis/Maryland-Pull-Out-Device-Model-Prep/raw/main/models/TopAttachment.stl) |
| `TopPlate_Circle-Rotation.stl` | Rotatable circular top plate | [Download](https://github.com/MaxeThis/Maryland-Pull-Out-Device-Model-Prep/raw/main/models/TopPlate_Circle-Rotation.stl) |
| `TopPlate_Hex-Fixed.stl` | Fixed hexagonal top plate | [Download](https://github.com/MaxeThis/Maryland-Pull-Out-Device-Model-Prep/raw/main/models/TopPlate_Hex-Fixed.stl) |

### 3-Screw Design (Standard)
| File | Description | Download |
|------|-------------|----------|
| `BasePlate - 3 screw.stl` | Base plate with 3 mounting screws | [Download](https://github.com/MaxeThis/Maryland-Pull-Out-Device-Model-Prep/raw/main/models/3-screw/BasePlate%20-%203%20screw.stl) |
| `Template_BasePlate - 3 screw.blend` | Blender source file | [Download](https://github.com/MaxeThis/Maryland-Pull-Out-Device-Model-Prep/raw/main/models/3-screw/Template_BasePlate%20-%203%20screw.blend) |

### 4-Screw Design (Variable Arch)
| File | Description | Download |
|------|-------------|----------|
| `BasePlate - 4 screw.stl` | Base plate with 4 mounting screws | [Download](https://github.com/MaxeThis/Maryland-Pull-Out-Device-Model-Prep/raw/main/models/4-screw/BasePlate%20-%204%20screw.stl) |
| `Template_BasePlate - 4 screw.blend` | Blender source file | [Download](https://github.com/MaxeThis/Maryland-Pull-Out-Device-Model-Prep/raw/main/models/4-screw/Template_BasePlate%20-%204%20screw.blend) |

---

## Design Variants

### 3-Screw Design (Standard)
- **Use Case:** Standard incisal edge testing configurations
- **Description:** The standard retention rig with 3 mounting screws

### 4-Screw Design (Variable Arch)
- **Use Case:** When additional adjustability is needed for varied arch forms
- **Description:** Alternative design with 4 mounting screws for greater arch positioning flexibility

---

## Troubleshooting

### Bottom Plate Deformation During Testing
If you experience deformation of the bottom plate during pull-out tests:
- **Solution:** Thicken the base plate for increased durability
- Open the `.blend` file in Blender and increase the plate thickness
- Re-export as STL for printing

---

## Printing Recommendations

- **Material:** PLA or PETG recommended
- **Infill:** 50-100% for structural rigidity
- **Layer Height:** 0.2mm or finer for screw hole accuracy

## File Formats

- `.STL` - Standard Triangle Language, compatible with most 3D printers and slicers
- `.blend` - Blender source files for modification

## License

These model files are provided under the same MIT License as the rest of this repository.

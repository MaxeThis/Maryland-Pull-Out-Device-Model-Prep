# Maryland Pull-Out Device Model Prep

A web-based application for preparing dental 3D scans for Instron machine retention testing. This tool automates the workflow of aligning dental models with the Maryland Pull-Out Device template and performing Boolean operations to create print-ready STL files.

## 🚀 Run Online

**[Launch App in Browser](https://maxethis.github.io/Maryland-Pull-Out-Device-Model-Prep/)** - No installation required.

## 💻 Install Desktop App

**[Download for Windows & Mac](https://github.com/MaxeThis/Maryland-Pull-Out-Device-Model-Prep/releases)** - Run natively on your machine.

## Overview

The Maryland Pull-Out Device is a standardized mounting system for orthodontic retention testing. This companion software streamlines the model preparation process, replacing manual workflows in Blender with an intuitive, purpose-built interface.

### Key Features

- **Drag-and-drop STL import** - Upload dental scans directly into the application
- **Guided alignment workflow** - Visual guides for positioning models relative to anatomical landmarks
- **Customizable arch filler** - Adjustable filler geometry to accommodate different arch forms
- **Automated Boolean operations** - Creates screw mounting holes and flush base surfaces
- **One-click STL export** - Outputs merged, print-ready geometry

## Usage

### Workflow

1. **Import** - Upload your dental 3D scan (STL format)
2. **Align Model** - Position the scan so:
   - Hooks align between the premolars
   - The 2mm guide aligns with the average gingival zenith
3. **Fit Arch Filler** - Scale and position the filler to fill the lingual/palatal void
4. **Process & Export** - Execute Boolean operations and export the merged STL

### Alignment Guidelines

| Reference | Anatomical Landmark |
|-----------|---------------------|
| **Hooks** | Between the premolars |
| **2mm Guide** | Average gingival zenith |

### Manipulation Constraints

- **Imported Model**: Move and rotate only (no scaling) to preserve anatomical accuracy
- **Arch Filler**: Move and scale (X/Y only) to fit the arch form

## Running the Application

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Then open `http://localhost:5173` in your browser.

## Technical Stack

- **Frontend**: Vanilla JavaScript with Vite
- **3D Rendering**: Three.js
- **Boolean Operations**: three-bvh-csg
- **UI Design**: Glassmorphism / Apple Glass aesthetic

---

## Rig Model Files

The physical retention rig components are available for download in the [`models/`](models/) folder. These are the 3D-printable parts that pair with this software.

### Available Designs

| Design | Description | Base Plate | Blender Source |
|--------|-------------|------------|----------------|
| **3-Screw (Standard)** | Standard mounting configuration | [Download STL](https://github.com/MaxeThis/Maryland-Pull-Out-Device-Model-Prep/raw/main/models/3-screw/BasePlate%20-%203%20screw.stl) | [Download .blend](https://github.com/MaxeThis/Maryland-Pull-Out-Device-Model-Prep/raw/main/models/3-screw/Template_BasePlate%20-%203%20screw.blend) |
| **4-Screw (Variable)** | Greater arch positioning flexibility | [Download STL](https://github.com/MaxeThis/Maryland-Pull-Out-Device-Model-Prep/raw/main/models/4-screw/BasePlate%20-%204%20screw.stl) | [Download .blend](https://github.com/MaxeThis/Maryland-Pull-Out-Device-Model-Prep/raw/main/models/4-screw/Template_BasePlate%20-%204%20screw.blend) |

### Top Components (Shared)
- [TopAttachment.stl](https://github.com/MaxeThis/Maryland-Pull-Out-Device-Model-Prep/raw/main/models/TopAttachment.stl)
- [TopPlate_Circle-Rotation.stl](https://github.com/MaxeThis/Maryland-Pull-Out-Device-Model-Prep/raw/main/models/TopPlate_Circle-Rotation.stl)
- [TopPlate_Hex-Fixed.stl](https://github.com/MaxeThis/Maryland-Pull-Out-Device-Model-Prep/raw/main/models/TopPlate_Hex-Fixed.stl)

### Customization

You are free to modify these files to suit your testing needs. The Blender source files (`.blend`) are provided for easy modification.

> **Tip:** If you experience deformation of the bottom plate during testing, you can thicken the base plate in Blender for increased durability.

These rig components may be integrated directly into the software in future versions.

## Citation

> ⚠️ **Citation information pending publication**
> 
> This section will be updated with complete citation details following journal acceptance.

If you use the Maryland Pull-Out Device and/or this software in your research, please cite our work:

```
Copello F, Mendelson M, Johnston T, Stafman A, Olaleye E. 
A 3D-Printed Device for Measuring Orthodontic Retainer and Aligner Retention: 
Design, Fabrication, and Application. 
[Journal - pending]. 2026.
```

### Authors

- **Flavio Copello, DDS, MS, PhD** - Clinical Assistant Professor, Department of Orthodontics and Pediatric Dentistry
- **Maxwell Mendelson** - Predoctoral Student
- **Trevor Johnston** - Predoctoral Student
- **Alexa Stafman** - Predoctoral Student
- **Esther Olaleye** - Summer Research Program Student

*University of Maryland School of Dentistry, Baltimore, MD*

### Software Reference

```
Maryland Pull-Out Device Model Prep
Repository: https://github.com/MaxeThis/Maryland-Pull-Out-Device-Model-Prep
Version: 1.0.0
```

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- University of Maryland School of Dentistry *(update as appropriate)*
- Three.js community
- three-bvh-csg library contributors

---

## Contact

For questions about the rig design or software, please contact:

- **Maxwell Mendelson** - *maxwell.mendelson@umaryland.edu*

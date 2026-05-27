const fs = require('fs');

let importergltf_js = fs.readFileSync('source/engine/import/importergltf.js', 'utf8');

importergltf_js = importergltf_js.replace(
    'let matrix = node.GetWorldTransformation ().GetMatrix ();\n                    let eye = new Coord3D (0, 0, 0);\n                    let target = new Coord3D (0, 0, -1);\n                    let up = new Coord3D (0, 1, 0);\n                    \n                    let eye4D = matrix.MultiplyVector (new Coord4D (eye.x, eye.y, eye.z, 1.0));\n                    let target4D = matrix.MultiplyVector (new Coord4D (target.x, target.y, target.z, 1.0));\n                    let up4D = matrix.MultiplyVector (new Coord4D (up.x, up.y, up.z, 0.0));',
    'let transformation = node.GetWorldTransformation ();\n                    let eye = new Coord3D (0, 0, 0);\n                    let target = new Coord3D (0, 0, -1);\n                    let up = new Coord3D (0, 1, 0);\n                    \n                    let eye4D = transformation.TransformCoord3D (eye);\n                    let target4D = transformation.TransformCoord3D (target);\n                    \n                    let up4D = transformation.GetMatrix ().MultiplyVector (new Coord4D (up.x, up.y, up.z, 0.0));'
);

fs.writeFileSync('source/engine/import/importergltf.js', importergltf_js);

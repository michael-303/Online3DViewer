const fs = require('fs');

let importergltf_js = fs.readFileSync('source/engine/import/importergltf.js', 'utf8');

importergltf_js = importergltf_js.replace(
    'let matrix = node.GetWorldTransformation ().GetMatrix ();',
    'let matrix = node.GetWorldTransformation ().GetMatrix ().Transpose ();'
);

// Blender glTF exports cameras looking down -Z axis with +Y up. The GetWorldTransformation matrix might need to apply on the default vectors. In THREE.js, standard camera looks down -Z.
// The transpose is because our Matrix implementation might be column-major when multiplying, or row-major. Let's look at MultiplyVector.

fs.writeFileSync('source/engine/import/importergltf.js', importergltf_js);

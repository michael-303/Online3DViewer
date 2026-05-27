import fs from 'fs';

let content = fs.readFileSync('source/website/website.js', 'utf8');

content = content.replace(
    "                if (rootObj.userData && rootObj.userData.videos) {",
    "                console.log('Toggling videos in root object. userData:', rootObj.userData);\n                if (rootObj.userData && rootObj.userData.videos) {"
);

fs.writeFileSync('source/website/website.js', content);

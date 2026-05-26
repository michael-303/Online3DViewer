import fs from 'fs';

let content = fs.readFileSync('source/website/website.js', 'utf8');

// Insert the play/stop toggle in the toolbar
let toggleButtonStr = `        AddSeparator (this.toolbar, ['only_full_width', 'only_on_model']);
        let videoPlaying = true;
        let videoToggleBtn = AddButton (this.toolbar, 'open', Loc ('Toggle Videos'), ['only_full_width', 'only_on_model'], () => {
            videoPlaying = !videoPlaying;
            if (this.viewer && this.viewer.mainModel && this.viewer.mainModel.mainModel && this.viewer.mainModel.mainModel.rootObject) {
                let rootObj = this.viewer.mainModel.mainModel.rootObject;
                if (rootObj.userData && rootObj.userData.videos) {
                    for (let video of rootObj.userData.videos) {
                        if (videoPlaying) video.play();
                        else video.pause();
                    }
                }
            }
        });
        AddSeparator (this.toolbar, ['only_full_width', 'only_on_model']);
        AddButton (this.toolbar, 'snapshot', Loc ('Create snapshot'), ['only_full_width', 'only_on_model'], () => {`;

content = content.replace(
    "        AddSeparator (this.toolbar, ['only_full_width', 'only_on_model']);\n        AddButton (this.toolbar, 'snapshot', Loc ('Create snapshot'), ['only_full_width', 'only_on_model'], () => {",
    toggleButtonStr
);

fs.writeFileSync('source/website/website.js', content);

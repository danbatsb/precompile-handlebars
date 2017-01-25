# precompile-handlebars
a webpack plug-in to precompile handlebar templates directories into concatenated files.

Developers wishing to migrate from grunt-based bundling to webpack-based bundling often face issues converting 
a bunch of tasks from the old grunt way of doing things to a new one.
One of these tasks is precompilation of handlbars templates. Most packages out there let you load and compile templates
on-the-fly as part of your webpack.config.js loaders section.
However, for those used to and interested in precompiling their templates and concatenate them to a single file there is
no an easy solution.
Here comes this tiny plug-in for webpack that allows you to achieve exactly that at the beginning of your webpack 
bundling process. It leverages the handlebars package and runs through a directory of templates to create a single js file.

Configuration is easy with a single object (or array of multiple ones) containing the input directory where your templates reside
and an output file name of concatenated precompiled templates.

To give it a try just install the package, go to the mode_modules/precompile-handlebars and run "webpack". The result will 
show up in the output directory. You can copy the plugin section in the webpack.config.js and add to your project plugins.
To precompile partials just use _ (underscore) at the beginning of your template file name.

## Usage
A simple usage in webpack.config.js:

```
var webpack = require('webpack');
var HandlebarsPlugin = require("precompile-handlebars");

module.exports = {
  ...
      plugins: [
        new HandlebarsPlugin([
            {
                inputDir: "templates",
                outputFile: "output/compiled-templates.js"
            },
            {
                inputDir: "my-other-templates",
                outputFile: "output/my-other-compiled-templates.js"
            }
        ])
    ],
}
```

Feedback welcome.

ronnen

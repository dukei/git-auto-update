```
name:         | git-auto-update-release
compiler:     | nodejs
version:      | v1.1.4, 20191103
```

# git-auto-update

## Description
The script will query any GitHub compatible API for latest version and compare with local version. If any update it required it will fetch the latest matching with the users operating system and update the desired program automatically. Supports striping for semantic version.

## Usage
```
// include
const updater = require('git-auto-update')
// use it!
updater({ url: 'https://github.com/cenk1cenk2/git-auto-update', 'version': 'v1.1.2' })
```

## Parameters
It accepts one big object for all the options.

 * @param url: Remote endpoint which the script will ask the latest version. It has to be GitHub compatible output form.
 * @param token: If using a private reporisitory a token can be provided for access._mat-animation-noopable
 * @param version: Current version. Just to compare with remote version.
 * @param useMaster: If you want to directly use the source files instead of compiled ones.
 * @param regex: { windowsRegex, linuxRegex, macRegex } as in regex or string form to match the releases with the current operating system._mat-animation-noopable
 * @param updatePath: BY DEFAULT IT WILL OVERWRITE ROOT FOLDER!!! Where will this update will be extracted? 

URL and version is required.

The defaults are as follows:
 ```
  { useMaster : false, regex: { windowsRegex : /-windows-/, linuxRegex : /-linux-/, macRegex : /-darwin-/ }, updatePath : './' }
 ```

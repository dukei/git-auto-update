const online = require('is-online')
const request = require('request')
const chalk = require('chalk')
const semver = require('semver')
const osFamily = require('os-family')
const fs = require('fs-extra')
const ProgressBar = require('progress')
const path = require('path')
const unzip = require('unzipper')
const untar = require('tar-fs')
const ungzip = require('gunzip-maybe')
const _ = require('lodash')

/**
 * Accepts one object to do it all.
 * @param {Object} Object Elements listed below
 * @param url Remote endpoint which the script will ask the latest version. It has to be GitHub compatible output form.
 * @param token If using a private reporisitory a token can be provided for access._mat-animation-noopable
 * @param version Current version. Just to compare with remote version.
 * @param useMaster If you want to directly use the source files instead of compiled ones.
 * @param output Supresses or enables the output.
 * @param regex { windowsRegex, linuxRegex, macRegex } as in regex or string form to match the releases with the current operating system._mat-animation-noopable
 * @param updatePath Where is the final update destination. Usually root of this project?
 * @param temporaryPath Where to keep files when they are getting unarchieved before renaming.
 */
async function update({ info, url, token, version, useMaster = false, regex = { windowsRegex: /-windows-/, linuxRegex: /-linux-/, macRegex: /-darwin-/ }, updatePath = './', temporaryPath = './update', output = false }) {
  // catch uncaught exceptions so the api do not crash
  process.on('uncaughtException', (e) => {console.error(e)});

  const freshUpdate = !info;

  if(freshUpdate)
    info = await getLatestReleaseInfo({url, token, output});
  if(!info)
    return false;

  if (checkNeedForUpdate(info, version, output && freshUpdate)) {
    // update if necesarry
    if (_.has(info, 'assets') && !useMaster) {
      var downloadLink = false
      if (osFamily.linux) {
        downloadLink = parseDownloadLink(info, regex.linuxRegex, useMaster, output)
      } else if (osFamily.win) {
        downloadLink = parseDownloadLink(info, regex.windowsRegex, useMaster, output)
      } else if (osFamily.mac) {
        downloadLink = parseDownloadLink(info, regex.macRegex, useMaster, output)
      }
      if (downloadLink) {
        // download the file
        const zipFilePath = path.join(updatePath, downloadLink.name);
        const fileDownloaded = await downloadFile(downloadLink.link, zipFilePath, token, output).catch()
        if (fileDownloaded) {
          await extractData(zipFilePath, temporaryPath, output).catch()
          // move files
          if (temporaryPath !== updatePath) {
            await fs.copy(getAbsPath(temporaryPath + '/'), getAbsPath(updatePath + '/'), {overwrite: true})
            await fs.remove(getAbsPath(temporaryPath + '/'))
          }
          // clean up the downloads
          await fs.unlink(getAbsPath(zipFilePath))
          // finish
          if (output) {
            console.log(chalk.green('Update complete...'))
          }
          return true
        }
      } else {
        if (output) {
          console.error(chalk.red('There is no download for the latest version of the software for this operating system.'))
        }
        return false
      }
    }
  }
}

async function check({info, url, token, version, output}){
  // catch uncaught exceptions so the api do not crash
  process.on('uncaughtException', (e) => {console.error(e)})

  if(!info)
    info = await getLatestReleaseInfo({url, token, output});
  if(!info)
    return false;

  if (checkNeedForUpdate(info, version, output)) {
    return true;
  }else{
    return false;
  }
}

async function getLatestReleaseInfo({url, token, output}){
  if (online()) {
    // add access token if specified
    if (token) {
      url = url.concat(`?access_token=${token}`)
    }
    // check for updates
    return new Promise((resolve, reject) => {
      request.get({ url, headers: { 'User-Agent': 'git-auto-update' } }, (error, response, body) => {
        if (!error && response.statusCode === 200) {
          resolve(JSON.parse(body));
        }else{
          if (output) {
            console.error(chalk.red('Can not reach the backend for update: ' + error))
          }
          resolve(null);
        }
      });
    });
  }else{
    if (output) {
      console.error(chalk.red('Not connected to internet, can not check for updates.'))
    }
  }
}


function checkNeedForUpdate(data, version, output) {
  if (_.has(data, 'tag_name')) {
    const latestVersion = semver.coerce(data.tag_name)
    version = semver.coerce(version)
    if (semver.valid(latestVersion) && semver.valid(version)) {
      const result = semver.gt(latestVersion, version)
      if (result) {
        if (output) {
          console.log(chalk.yellow(`Found new update... v${latestVersion.version} > v${version.version}`))
        }
      }
      return result
    } else {
      if (output) {
        console.error(chalk.red('Semantic versioning is not valid. Cancelling update.'))
      }
    }
  } else {
    if (output) {
      console.error(chalk.red('API did not respond with a valid release tag.'))
    }
    return false
  }
}

function parseDownloadLink(body, regex, useMaster, output) {
  var link, name
  if (!useMaster) {
    body.assets.map(async asset => {
      if (_.has(asset, 'name')) {
        if (asset.name.match(regex)) {
          if (_.has(asset, 'browser_download_url')) {
            link = asset.browser_download_url
            name = asset.name
          } else {
            if (output) {
              console.error(chalk.red('Download URL can not be found for update.'))
            }
          }
        }
      } else {
        if (output) {
          console.error(chalk.red('Can not match the version with the latest release name. Incompatible response from update server. Asset must have a name.'))
        }
      }
    })
  } else {
    link = body.zipball_url || body.tarball_url
    name = `auto-update_${body.tag_name}.${body.zipball_url ? '.zip' : '.tar.gz'}`
  }
  return { link, name } || false
}

function downloadFile(link, name, token, output) {
  return new Promise(resolve => {
    request({ url: link, headers: { 'User-Agent': 'git-auto-update', Authorization: `token ${token}`, Accept: 'application/octet-stream' } })
      .on('response', response => {
        if (response.statusCode === 200) {
          if (_.has(response, ['headers', 'content-length']) && output) {
            var downloadProgressBar = new ProgressBar(chalk.green('|:bar| Downloading update > :percent, complete in :etas'), { total: parseInt(response.headers['content-length']), complete: '█', incomplete: ' ', width: 100 })
            response.on('data', data => {
              downloadProgressBar.tick(parseInt(data.length))
            })
          } else {
            if (output) {
              console.log(chalk.green('Downloading update...'))
            }
          }
          response.pipe(fs.createWriteStream(name))
        } else {
          if (output) {
            console.error(chalk.bgRed(chalk.white('Can not download update from update server.')))
          }
          resolve(false)
        }
      })
      .on('error', err => {
        if (output) {
          console.error(chalk.red(err))
        }
      })
      .on('end', () => resolve(true))
  })
}

function getAbsPath(relPath) {
  if (typeof process.pkg === 'undefined') {
    return path.resolve(process.cwd(), relPath)
  } else {
    return path.resolve(path.dirname(process.execPath), relPath)
  }
}

function extractData(zipPathName, updatePath, output) {
  return new Promise(resolve => {
    if (path.extname(zipPathName) === '.gz') {
      // extract from tar ball or gzip
      if (output) {
        console.log(chalk.keyword('orange')('Extracting gzip archive file...'))
      }
      fs.createReadStream(getAbsPath(zipPathName))
        .pipe(ungzip())
        .pipe(untar.extract(getAbsPath(updatePath)))
        .on('finish', () => {
          resolve(true)
        })
    } else if (path.extname(zipPathName) === '.tar') {
      if (output) {
        console.log(chalk.keyword('orange')('Extracting tarball archive file...'))
      }
      fs.createReadStream(getAbsPath(zipPathName))
        .pipe(untar.extract(getAbsPath(updatePath)))
        .on('finish', () => {
          resolve(true)
        })
    } else if (path.extname(zipPathName) === '.zip') {
      // extract from zip file
      if (output) {
        console.log(chalk.keyword('orange')('Extracting zip archive file...'))
      }
      fs.createReadStream(zipPathName)
        .pipe(unzip.Extract({ path: getAbsPath(updatePath) }))
        .on('finish', () => {
          resolve(true)
        })
    } else {
      resolve(true)
    }
  })
}

module.exports = {
  update,
  check,
  getLatestReleaseInfo
}

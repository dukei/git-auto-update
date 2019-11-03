const online = require('is-online')
const request = require('request')
const chalk = require('chalk')
const semver = require('semver')
const osFamily = require('os-family')
const fs = require('fs')
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
 * @param regex { windowsRegex, linuxRegex, macRegex } as in regex or string form to match the releases with the current operating system._mat-animation-noopable
 * @param updatePath BY DEFAULT IT WILL OVERWRITE ROOT FOLDER!!! Where will this update will be extracted?
 */
function update({ url, token, version, useMaster = false, regex = { windowsRegex: /-windows-/, linuxRegex: /-linux-/, macRegex: /-darwin-/ }, updatePath = './' }) {
  if (online()) {
    // add access token if specified
    if (token) {
      url = url.concat(`?access_token=${token}`)
    }
    // check for updates
    return new Promise((resolve, reject) => {
      request.get({ url, headers: { 'User-Agent': 'git-auto-update' } }, async (error, response, body) => {
        if (!error && response.statusCode === 200) {
          body = JSON.parse(body)
          if (checkNeedForUpdate(body, version)) {
            // update if necesarry
            if (_.has(body, 'assets') && !useMaster) {
              var downloadLink = false
              if (osFamily.linux) {
                downloadLink = parseDownloadLink(body, regex.linuxRegex, useMaster)
              } else if (osFamily.win) {
                downloadLink = parseDownloadLink(body, regex.windowsRegex, useMaster)
              } else if (osFamily.mac) {
                downloadLink = parseDownloadLink(body, regex.macRegex, useMaster)
              }
              if (downloadLink) {
                // download the file
                const fileDownloaded = await downloadFile(downloadLink.link, downloadLink.name, token)
                if (fileDownloaded) {
                  await extractData(downloadLink, updatePath)
                  // clean up the downloads
                  fs.unlinkSync(getAbsPath(downloadLink.name))
                  // finish
                  console.log(chalk.green('Update complete...'))
                  resolve(true)
                }
              } else {
                console.error(chalk.red('There is no download for the latest version of the software for this operating system.'))
                resolve(false)
              }
            }
          } else {
            resolve(false)
          }
        } else {
          console.error(chalk.red('Can not reach the backend for updates.'))
        }
      })
    })
  } else {
    console.error(chalk.red('Not connected to internet, can not check for updates.'))
  }
}

function checkNeedForUpdate(data, version) {
  if (_.has(data, 'tag_name')) {
    const latestVersion = semver.coerce(data.tag_name)
    version = semver.coerce(version)
    if (semver.valid(latestVersion) && semver.valid(version)) {
      const result = semver.gt(latestVersion, version)
      if (result) {
        console.log(chalk.yellow(`Found new update... v${latestVersion.version} > v${version.version}`))
      }
      return result
    } else {
      console.error(chalk.red('Semantic versioning is not valid. Cancelling update.'))
    }
  } else {
    console.error(chalk.red('API did not respond with a valid release tag.'))
    return false
  }
}

function parseDownloadLink(body, regex, useMaster) {
  var link, name
  if (!useMaster) {
    body.assets.forEach(async asset => {
      if (_.has(asset, 'name')) {
        if (asset.name.match(regex)) {
          if (_.has(asset, 'url')) {
            link = asset.url
            name = asset.name
          } else {
            console.error(chalk.red('Download URL can not be found for update.'))
          }
        }
      } else {
        console.error(chalk.red('Can not match the version with the latest release name. Incompatible response from update server. Asset must have a name.'))
      }
    })
  } else {
    link = body.zipball_url || body.tarball_url
    name = `auto-update_${body.tag_name}.${body.zipball_url ? '.zip' : '.tar.gz'}`
  }
  return { link, name } || false
}

function downloadFile(link, name, token) {
  return new Promise(resolve => {
    request({ url: link, headers: { 'User-Agent': 'git-auto-update', Authorization: `token ${token}`, Accept: 'application/octet-stream' } })
      .on('response', response => {
        if (response.statusCode === 200) {
          if (_.has(response, ['headers', 'content-length'])) {
            var downloadProgressBar = new ProgressBar(chalk.green('|:bar| Downloading update > :percent, complete in :etas'), { total: parseInt(response.headers['content-length']), complete: '█', incomplete: ' ', width: 100 })
            response.on('data', data => {
              downloadProgressBar.tick(parseInt(data.length))
            })
          } else {
            console.log(chalk.green('Downloading update...'))
          }
          response.pipe(fs.createWriteStream(name))
        } else {
          console.error(chalk.bgRed(chalk.white('Can not download update from update server.')))
          resolve(false)
        }
      })
      .on('error', err => {
        console.error(chalk.red(err))
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

function extractData(downloadLink, updatePath) {
  return new Promise(resolve => {
    if (path.extname(downloadLink.name) === '.gz') {
      // extract from tar ball or gzip
      console.log(chalk.keyword('orange')('Extracting gzip archieve file...'))
      fs.createReadStream(getAbsPath(downloadLink.name))
        .pipe(ungzip())
        .pipe(untar.extract(getAbsPath(updatePath)))
        .on('finish', () => {
          resolve(true)
        })
    } else if (path.extname(downloadLink.name) === '.tar') {
      console.log(chalk.keyword('orange')('Extracting tarball archieve file...'))
      fs.createReadStream(getAbsPath(downloadLink.name))
        .pipe(untar.extract(getAbsPath(updatePath)))
        .on('finish', () => {
          resolve(true)
        })
    } else if (path.extname(downloadLink.name) === '.zip') {
      // extract from zip file
      console.log(chalk.keyword('orange')('Extracting zip archieve file...'))
      fs.createReadStream(downloadLink.name)
        .pipe(unzip.Extract({ path: getAbsPath(updatePath) }))
        .on('finish', () => {
          resolve(true)
        })
    } else {
      resolve(true)
    }
  })
}

module.exports = update

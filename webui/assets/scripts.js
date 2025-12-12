import { exec, spawn, toast } from "kernelsu-alt";
import '@material/web/all.js';
import { translations, loadTranslations } from './locales.js';

let scriptOnly = false;
let shellRunning = false;
let initialPinchDistance = null;
let currentFontSize = 14;
let model = null, product = null;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 24;

const repository = 'KOWX712/PlayIntegrityFix';
const branch = 'inject_s';
const moddir = '/data/adb/modules/playintegrityfix';

const spoofConfig = [
    { config: 'spoofBuild', label: 'Spoof Build' },
    { config: 'spoofVendingBuild', label: 'Spoof Build' },
    { config: 'spoofProps', label: 'Spoof Props' },
    { config: 'spoofProvider', label: 'Spoof Provider' },
    { config: 'spoofSignature', label: 'Spoof Signature' },
    { config: 'spoofVendingSdk', label: 'Spoof Sdk' }
];

// Append spoofConfig buttons
function appendSpoofConfigToggles() {
    const buttonBox = document.querySelector('.button-box');
    if (!buttonBox) return;

    spoofConfig.forEach((item) => {
        const { config, label } = item;
        const container = document.createElement('label');
        container.className = 'spoof-option';
        container.id = `${config}-container`;
        container.innerHTML = `
        ${label}
        ${config.toLowerCase().includes('vending') ?
            `<div class="spoof-option-tag">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M14.222 9.374c1.037-.61 1.037-2.137 0-2.748L11.528 5.04 8.32 8l3.207 2.96zm-3.595 2.116L7.583 8.68 1.03 14.73c.201 1.029 1.36 1.61 2.303 1.055zM1 13.396V2.603L6.846 8zM1.03 1.27l6.553 6.05 3.044-2.81L3.333.215C2.39-.341 1.231.24 1.03 1.27"/></svg>
                <span>Play Store</span>
            </div>` : ''
        }
        <md-switch id="${config}-toggle"></md-switch><md-ripple></md-ripple>
        `;

        buttonBox.appendChild(container);
    });

    applyButtonEventListeners();
}

// Apply button event listeners
function applyButtonEventListeners() {
    const fetchBtn = document.getElementById('fetch');
    const autopifBtn = document.getElementById('autopif');
    const randomRadio = document.getElementById('random');
    const viewBtn = document.getElementById('view');
    const securityPatchBtn = document.getElementById('security-patch');
    const scriptOnlyBtn = document.getElementById('script-only');
    const clearButton = document.getElementById('clear-terminal');
    const terminal = document.querySelector('.output-terminal-content');
    const selectDeviceDialog = document.getElementById('select-device-dialog');
    const confirmFetchBtn = document.getElementById('confirm-fetch');
    const githubBtn = document.getElementById('github-btn');
    const helpBtn = document.getElementById('help-btn');
    const helpDialog = document.getElementById('help-dialog');
    const romSignCheck = document.getElementById('rom-sign-check');

    fetchBtn.onclick = () => {
        if (randomRadio.checked) randomRadio.checked = false;
        selectDeviceDialog.show();
    }

    autopifBtn.onclick = runAction;

    randomRadio.addEventListener('change', (e) => {
        if (!e.target.checked) return;
        const deviceList = document.querySelectorAll('.device-list-option');
        if (deviceList.length >= 2) {
            // Exclude index 0 to avoid selecting the random radio itself
            const randomIndex = Math.floor(Math.random() * (deviceList.length - 1)) + 1;
            product = deviceList[randomIndex].querySelector('md-radio').value;
            model = deviceList[randomIndex].querySelector('span').textContent;
        } else {
            model = null;
            product = null;
            confirmFetchBtn.disabled = true;
        }
    });

    viewBtn.onclick = async () => {
        const result = await exec(`cat /data/adb/pif.prop || cat ${moddir}/pif.prop`);
        if (result.errno === 0) {
            const lines = result.stdout.split('\n').filter(line => line.trim() !== '');
            lines.forEach(line => appendToOutput(line));
            appendToOutput("");
        } else {
            appendToOutput(`[!] ${translations.output_error_read_pif_prop}: ${result.stderr}`, true);
        }
    }

    securityPatchBtn.onclick = async () => {
        await exec(`sh ${moddir}/security_patch.sh --${securityPatchBtn.selected ? 'enable' : 'disable'}`);
        await loadAutoSecurityPatchConfig();
        appendToOutput(`[+] ${securityPatchBtn.selected ? translations.output_enabled : translations.output_disabled} auto security patch.`);
    }

    scriptOnlyBtn.onclick = async () => {
        await exec(`${scriptOnly ? 'rm -rf /data/adb/pif_script_only' : 'touch /data/adb/pif_script_only'} || true`);
        killGms();
        loadScriptOnlyConfig();
        appendToOutput(`[+] ${scriptOnly ? translations.output_disabled : translations.output_enabled} script only mode.`);
    }

    confirmFetchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.device-list-option md-radio').forEach(item => {
            if (!item.checked) return;
            fetchPifProp();
            selectDeviceDialog.close();
        });
    });

    clearButton.onclick = () => {
        terminal.innerHTML = '';
        currentFontSize = 14;
        updateFontSize(currentFontSize);
    }

    terminal.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            initialPinchDistance = getDistance(e.touches[0], e.touches[1]);
        }
    }, { passive: false });
    terminal.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const currentDistance = getDistance(e.touches[0], e.touches[1]);
            
            if (initialPinchDistance === null) {
                initialPinchDistance = currentDistance;
                return;
            }

            const scale = currentDistance / initialPinchDistance;
            const newFontSize = currentFontSize * scale;
            updateFontSize(newFontSize);
            initialPinchDistance = currentDistance;
        }
    }, { passive: false });
    terminal.addEventListener('touchend', () => {
        initialPinchDistance = null;
    });
    
    githubBtn.onclick = () => linkRedirect(`https://github.com/${repository}/releases/latest`);
    helpBtn.onclick = () => helpDialog.show();

    romSignCheck.onclick = () => {
        const command = romSignCheck.parentElement.querySelector('code').textContent;
        appendToOutput(command);
        appendToOutput('');
        exec(command).then((result) => {
            const isSuccess = result.errno === 0;
            setTimeout(() => {
                appendToOutput(isSuccess ? result.stdout : result.stderr, !isSuccess);
            }, 600);
        });
    }
}

function linkRedirect(link) {
    toast("Redirecting to " + link);
    setTimeout(() => {
        exec(`am start -a android.intent.action.VIEW -d ${link}`)
            .then(({ errno }) => {
                if (errno !== 0) window.open(link, "_blank");
            });
    }, 100);
}

// Function to load the version from module.prop
function loadVersionFromModuleProp() {
    const versionElement = document.getElementById('version-text');
    exec(`grep '^version=' ${moddir}/module.prop | cut -d'=' -f2`)
        .then((result) => {
            if (result.errno !== 0) return;
            versionElement.textContent = result.stdout.trim();
            checkDescription();
        });
}

// Check description
async function checkDescription() {
    const unofficialDialog = document.getElementById('unofficial-warning');
    const { errno } = await exec(`grep -q 'tampered' ${moddir}/module.prop`);
    if (typeof ksu !== 'undefined' && errno === 0) unofficialDialog.show();
}

// Function to load spoof config
async function loadSpoofConfig() {
    try {
        const { errno, stdout, stderr } = await exec(`cat /data/adb/pif.prop || cat ${moddir}/pif.prop`);
        if (errno !== 0) throw new Error(stderr);

        const pifMap = parsePropToMap(stdout);
        spoofConfig.forEach(item => {
            const toggle = document.getElementById(`${item.config}-toggle`);
            toggle.selected = pifMap[item.config];
        });

        if (model === null) model = pifMap.MODEL;
    } catch (error) {
        appendToOutput(`[!] ${translations.output_error_load_spoof_config}: ${error}`, true);
        appendToOutput('[!] ' + translations.output_warning_third_party_tool);
        resetPifProp();
    }
}

// Reset pif.prop to default
function resetPifProp() {
    fetch(`https://raw.githubusercontent.com/${repository}/${branch}/module/pif.prop`)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.text();
        })
        .catch(error => {
            return fetch(`https://hub.gitmirror.com/raw.githubusercontent.com/${repository}/${branch}/module/pif.prop`)
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    return response.text();
                });
        })
        .then(async text => {
            const pifProp = text.trim();
            const { errno, stderr } = await exec(`
                echo '${pifProp}' > ${moddir}/pif.prop
                rm -f /data/adb/pif.prop
            `);
            if (errno === 0) {
                appendToOutput('[+] ' + translations.output_reset_pif_prop);
            } else {
                throw new Error(stderr);
            }
        })
        .catch(error => {
            appendToOutput(`[!] ${translations.output_error_reset_failed}: ${error.message}`, true);
        });
}

// Function to setup spoof config button
function setupSpoofConfigButton() {
    spoofConfig.forEach(item => {
        const toggle = document.getElementById(`${item.config}-toggle`);

        toggle.addEventListener('change', () => {
            if (shellRunning) return;
            let pifFile = '';
            const result = spawn(`
                echo "${moddir}/pif.prop"
                [ ! -f /data/adb/pif.prop ] || echo "/data/adb/pif.prop"
            `);
            result.stdout.on('data', (data) => pifFile += data + '\n');
            result.on('exit',  (code) => {
                if (code !== 0) return;
                updateSpoofConfig(toggle, item.config, pifFile);
                killGms();
            });
        });
    });
}

function killGms() {
    spawn('kill', ['-9', '$(busybox pidof com.google.android.gms.unstable com.android.vending)'],
        { env: { PATH: "$PATH:/data/adb/ap/bin:/data/adb/ksu/bin:/data/adb/magisk" } });
}

/**
 * Update pif.prop
 * @param {HTMLInputElement} toggle - config toggle of pif.prop
 * @param {string} type - prop key to change
 * @param {string} pifFile - Path of pif.prop list
 * @returns {void}
 */
function updateSpoofConfig(toggle, type, pifFile) {
    let reminded = false, prompted = false;
    const files = pifFile.split('\n').filter(line => line.trim() !== '');

    for (const pifFile of files) {
        try {
            let stdout = '';

            // read
            const read = spawn(`cat ${pifFile}`);
            read.stdout.on('data', (data) => stdout += data + '\n');
            read.on('exit', async () => {
                const pifMap = parsePropToMap(stdout);

                // update field
                pifMap[type] = toggle.selected;
                const prop = parseMapToProp(pifMap);

                // write
                const write = spawn(`echo '${prop}' > ${pifFile}`);
                write.on('exit', (code) => {
                    if (code === 0) {
                        if (prompted) return;
                        prompted = true;
                        appendToOutput(`[+] ${toggle.selected ? translations.output_enabled : translations.output_disabled} ${type}`);
                    } else {
                        throw new Error('Failed to write ' + pifFile);
                    }
                });

                // reminder
                if (!reminded && (type === "spoofVendingBuild" || type === "spoofVendingSdk") && pifMap.spoofVendingBuild && pifMap.spoofVendingSdk) {
                    appendToOutput('[!] ' + translations.output_spoofVendingSdk_spoofVendingBuild);
                    reminded = true;
                }
            });
        } catch (error) {
            console.error(`Failed to update ${pifFile}:`, error);
            appendToOutput(`[!] ${toggle.selected ? output_error_enable_failed : output_error_disable_failed} ${item.config}`);
        }
    }
}

/**
 * Append line to fake terminal
 * @param {string} content - text to display
 * @param {boolean} error - true: show text in red
 */
function appendToOutput(content, error = false) {
    const output = document.querySelector('.output-terminal-content');
    if (content.trim() === "") {
        const lineBreak = document.createElement('br');
        output.appendChild(lineBreak);
    } else {
        const line = document.createElement('p');
        line.className = 'output-content';
        line.innerHTML = content;
        if (error) line.style.color = 'red';
        output.appendChild(line);
    }
    output.scrollTop = output.scrollHeight;
}

// Function to run the script and display its output
function runAction() {
    if (shellRunning) return;
    muteToggle(true);
    let opts = {};
    if (model && product) opts = { env: { MODEL: `"${model}"`, PRODUCT: `"${product}"`} };
    const scriptOutput = spawn("sh", [`${moddir}/autopif.sh`], opts);
    scriptOutput.stdout.on('data', (data) => appendToOutput(data));
    scriptOutput.stderr.on('data', (data) => appendToOutput(data, true));
    scriptOutput.on('exit', () => {
        appendToOutput("");
        muteToggle(false);
    });
}

function updateAutopif() {
    muteToggle(true);
    const scriptOutput = spawn("sh", [`${moddir}/autopif_ota.sh`]);
    scriptOutput.stdout.on('data', (data) => appendToOutput(data));
    scriptOutput.stderr.on('data', (data) => appendToOutput(data, true));
    scriptOutput.on('exit', () => muteToggle(false));
}

function muteToggle(mute, scriptOnly = null) {
    shellRunning = mute;
    document.querySelectorAll('md-switch, md-assist-chip, md-filter-chip, md-ripple').forEach(item => {
        if (item.id === 'script-only' || item.hasAttribute('unsupported') || (scriptOnly === null && item.hasAttribute('scrip-only'))) return;
        if (scriptOnly) scriptOnly ? item.setAttribute('scrip-only', '') : item.removeAttribute('scrip-only');
        item.disabled = mute
    });
}

/**
 * Parse prop to map
 * @param {string} prop - prop string
 * @returns {Object} - map of prop
 */
function parsePropToMap(prop) {
    const map = {};
    if (!prop || typeof prop !== 'string') return map;
    const lines = prop.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        if (value === 'true' || value === 'false') value = value === 'true';
        else if (/^\d+$/.test(value)) value = parseInt(value, 10);
        else if (/^\d+\.\d+$/.test(value)) value = parseFloat(value);
        map[key] = value;
    }
    return map;
}

/**
 * Parse map to prop
 * @param {Object} map - map of prop
 * @returns {string} - prop string
 */
function parseMapToProp(map) {
    if (!map || typeof map !== 'object') return '';
    return Object.entries(map)
        .map(([key, value]) => {
            if (typeof value === 'boolean') return `${key}=${value ? 'true' : 'false'}`;
            return `${key}=${value}`;
        })
        .join('\n');
}

// Function to check if running in MMRL
async function checkMMRL() {
    if (typeof ksu !== 'undefined' && ksu.mmrl) {
        // Set status bars theme based on device theme
        try {
            $playintegrityfix.setLightStatusBars(!window.matchMedia('(prefers-color-scheme: dark)').matches)
        } catch (error) {
            console.log("Error setting status bars theme:", error)
        }
    }
}

async function loadAutoSecurityPatchConfig() {
    const btn = document.getElementById('security-patch');
    await exec('[ -d "/data/adb/modules/tricky_store" ] && [ ! -e "/data/adb/modules/tricky_store/disable" ]')
        .then(async (ts) => {
            if (ts.errno !== 0) {
                btn.setAttribute('unsupported', '');
                btn.disabled = true;
            } else {
                await exec('[ -e "/data/adb/tricky_store/pif_auto_security_patch" ]').then((enable) => {
                    btn.selected = enable.errno === 0;
                });
            }
        });
}

function loadScriptOnlyConfig() {
    exec('[ -e "/data/adb/pif_script_only" ]')
        .then(({ errno }) => {
            scriptOnly = errno === 0;
            document.getElementById('script-only').selected = scriptOnly;
            muteToggle(scriptOnly, scriptOnly);
        });
}

function fetchPifProp() {
    appendToOutput("[+] " + translations.output_fetching_from_github);
    appendToOutput("");
    fetch(`https://raw.githubusercontent.com/${repository}/bot/device_prop/${product}.prop`)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.text();
        })
        .catch(error => {
            return fetch(`https://hub.gitmirror.com/raw.githubusercontent.com/${repository}/bot/device_prop/${product}.prop`)
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    return response.text();
                });
        })
        .then(async (pifProp) => {
            const { stdout } = await exec(`cat ${moddir}/pif.prop`);
            let pifMap = parsePropToMap(stdout);
            const newPifMap = parsePropToMap(pifProp);
            pifMap = { ...pifMap, ...newPifMap };
            const newPifProp = parseMapToProp(pifMap);
            exec(`
cat <<EOF | tee /data/adb/pif.prop
${newPifProp}
EOF

echo ""
echo "- new pif.prop saved to /data/adb/pif.prop"

if [ -e "/data/adb/tricky_store/pif_auto_security_patch" ]; then
	sh "${moddir}/security_patch.sh"
fi
            `).then((result) => {
                if (result.errno === 0) {
                    result.stdout.split('\n').forEach(line => appendToOutput(line));
                } else {
                    appendToOutput(`[!] ${translations.output_error_write_pif_prop}: ` + result.stderr, true);
                }
                killGms();
            });
        })
        .catch(error => {
            appendToOutput(`[!] ${translations.output_error_fetch_pif_prop}: ` + error, true);
        });
}

// Render available device list to select menu
function setupDeviceList() {
    const list = document.getElementById('device-list');

    fetch(`https://raw.githubusercontent.com/${repository}/bot/device_list.json`)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .catch(error => {
            return fetch(`https://hub.gitmirror.com/raw.githubusercontent.com/${repository}/bot/device_list.json`)
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    return response.json();
                });
        })
        .then(devices => {
            if (!Array.isArray(devices)) throw new Error('Invalid device list format');
            list.querySelector('#device-list-loading').remove();
            devices.forEach(device => {
                if (device.model && device.product) {
                    const label = document.createElement('label');
                    label.className = 'device-list-option';
                    label.innerHTML = `
                    <md-radio name="device" value="${device.product}" data-model="${device.model}"></md-radio>
                    <span aria-hidden="true">${device.model}</span>
                    `;

                    label.addEventListener('change', (e) => {
                        if (e.target.checked) {
                            model = device.model;
                            product = device.product;
                        }
                    });

                    if (model && model === device.model) {
                        product = device.product;
                        label.querySelector('md-radio').setAttribute('checked', '');
                    }

                    list.appendChild(label);
                }
            });
        })
        .catch(error => {
            list.querySelector('#device-list-loading').innerHTML = `<div>${translations.device_list_load_failed}</div>`;
            document.getElementById('confirm-fetch').disabled = true;
        });
}

// Notify if pif.prop security patch is more than 60 days
function checkPropDate() {
    exec(`
        prop_date="$(grep "^SECURITY_PATCH=" /data/adb/pif.prop ${moddir}/pif.prop 2>/dev/null | cut -d'=' -f2 | head -n 1)"
        prop_epoch="$(busybox date -d "$prop_date" +%s)"
        current_epoch="$(busybox date +%s)"
        different="$(($current_epoch - $prop_epoch))"
        if [ $different -gt 7776000 ]; then
            # 90d * 24h * 60m * 60s = 7776000
            echo "outdated"
        fi
    `, { env: { PATH: "$PATH:/data/adb/ap/bin:/data/adb/ksu/bin:/data/adb/magisk" }}).then((result) => {
        if (result.stdout.includes("outdated")) appendToOutput('[!] ' + translations.output_oudated_pif_prop, true);
    });
}

// Notify when selinux is permissive
function checkSeLinuxStatus() {
    exec('getenforce').then((result) => {
        if (result.errno !== 0) return;
        if (result.stdout.trim() === 'Permissive') {
            appendToOutput("[!] " + translations.output_selinux_permissive, true)
        }
    });
}

// Notify spoofSignature is on/off when rom is signed with releasekey/testkey
function checkRomSignature() {
    const toggle = document.getElementById('spoofSignature-toggle');
    exec('unzip -l /system/etc/security/otacerts.zip | grep -oE "testkey|releasekey"').then((signature) => {
        if (signature.errno === 0) {
            if (signature.stdout.trim() === "testkey" && !toggle.selected) {
                appendToOutput('[!] ' + translations.output_testkey);
            } else if (signature.stdout.trim() === "releasekey" && toggle.selected) {
                appendToOutput('[+] ' + translations.output_releasekey);
            }
        }
    }).catch(() => {});
}

function getDistance(touch1, touch2) {
    return Math.hypot(
        touch1.clientX - touch2.clientX,
        touch1.clientY - touch2.clientY
    );
}

function updateFontSize(newSize) {
    currentFontSize = Math.min(Math.max(newSize, MIN_FONT_SIZE), MAX_FONT_SIZE);
    const terminal = document.querySelector('.output-terminal-content');
    terminal.style.fontSize = `${currentFontSize}px`;
}

// Overwrite default dialog animation
document.querySelectorAll('md-dialog').forEach(dialog => {
    const originalGetOpenAnimation = dialog.getOpenAnimation;
    const originalGetCloseAnimation = dialog.getCloseAnimation;

    dialog.getOpenAnimation = () => {
        const defaultAnim = originalGetOpenAnimation ? originalGetOpenAnimation.call(dialog) : {};
        const customAnim = {};
        Object.keys(defaultAnim).forEach(key => customAnim[key] = defaultAnim[key]);

        customAnim.dialog = [
            [
                [{ opacity: 0, transform: 'translateY(50px)' }, { opacity: 1, transform: 'translateY(0)' }],
                { duration: 300, easing: 'ease' }
            ]
        ];
        customAnim.scrim = [
            [
                [{'opacity': 0}, {'opacity': 0.32}],
                {duration: 300, easing: 'linear'},
            ],
        ];
        customAnim.container = [];

        return customAnim;
    };

    dialog.getCloseAnimation = () => {
        const defaultAnim = originalGetCloseAnimation ? originalGetCloseAnimation.call(dialog) : {};
        const customAnim = {};
        Object.keys(defaultAnim).forEach(key => customAnim[key] = defaultAnim[key]);

        customAnim.dialog = [
            [
                [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-50px)' }],
                { duration: 300, easing: 'ease' }
            ]
        ];
        customAnim.scrim = [
            [
                [{'opacity': 0.32}, {'opacity': 0}],
                {duration: 300, easing: 'linear'},
            ],
        ];
        customAnim.container = [];

        return customAnim;
    };
});

document.addEventListener('DOMContentLoaded', async () => {
    await loadTranslations();
    checkMMRL();
    appendSpoofConfigToggles();
    loadVersionFromModuleProp();
    await loadSpoofConfig();
    setupSpoofConfigButton();
    loadAutoSecurityPatchConfig();
    loadScriptOnlyConfig();
    setupDeviceList();
    updateAutopif();
    checkSeLinuxStatus();
    checkPropDate();
    checkRomSignature();

    document.querySelectorAll('[unresolved]').forEach(el => el.removeAttribute('unresolved'));
});

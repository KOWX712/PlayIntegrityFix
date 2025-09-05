import { exec, spawn, toast } from "./assets/kernelsu.js";

let scriptOnly = false;
let shellRunning = false;
let initialPinchDistance = null;
let currentFontSize = 14;
let model = null, product = null;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 24;

const spoofConfig = [
    { config: 'spoofBuild', label: 'Spoof Build', isAdvanced: false },
    { config: 'spoofVendingBuild', label: 'Spoof Build (Play Store)', isAdvanced: false },
    { config: 'spoofProps', label: 'Spoof Props', isAdvanced: true },
    { config: 'spoofProvider', label: 'Spoof Provider', isAdvanced: true },
    { config: 'spoofSignature', label: 'Spoof Signature', isAdvanced: true },
    { config: 'spoofVendingSdk', label: 'Spoof Sdk (Play Store)', isAdvanced: true }
];

// Apeend spoofConfig button
function appendSpoofConfigToggles() {
    const advancedDiv = document.getElementById('advanced');
    const buttonBox = document.querySelector('.button-box');
    if (!buttonBox) return;

    spoofConfig.forEach((item, idx) => {
        const { config, label, isAdvanced } = item;
        const container = document.createElement('div');
        container.className = `toggle-list ripple-element${isAdvanced ? ' advanced-option' : ''}`;
        container.id = `${config}-container`;
        container.innerHTML = `
            <div class="toggle${idx === spoofConfig.length - 1 ? ' last-toggle' : ''}">
                <span class="toggle-text">${label}</span>
                <label class="toggle-switch">
                    <input type="checkbox" id="${config}-toggle" disabled>
                    <span class="slider round"></span>
                </label>
            </div>
        `;
        buttonBox.insertBefore(container, advancedDiv);
    });

    applyButtonEventListeners();
}

// Apply button event listeners
function applyButtonEventListeners() {
    const fetchButton = document.getElementById('fetch');
    const viewButton = document.getElementById('view');
    const scriptOnlyToggle = document.getElementById('script-only-container');
    const advanced = document.getElementById('advanced');
    const clearButton = document.querySelector('.clear-terminal');
    const terminal = document.querySelector('.output-terminal-content');
    const githubBtn = document.getElementById('github-btn');

    fetchButton.addEventListener('click', runAction);
    viewButton.addEventListener('click', async () => {
        const result = await exec(`
            if [ -f /data/adb/pif.prop ]; then
                cat /data/adb/pif.prop
            else
                cat /data/adb/modules/playintegrityfix/pif.prop
            fi
        `);
        if (result.errno === 0) {
            const lines = result.stdout.split('\n').filter(line => line.trim() !== '');
            lines.forEach(line => appendToOutput(line));
            appendToOutput("");
        } else {
            appendToOutput(`[!] Failed to read pif.prop: ${result.stderr}`, true);
        }
    });

    scriptOnlyToggle.addEventListener('click', async () => {
        await exec(`${scriptOnly ? 'rm -rf /data/adb/pif_script_only' : 'touch /data/adb/pif_script_only'} || true
            killall com.google.android.gms.unstable || true
            killall com.android.vending || true
        `);
        loadScriptOnlyConfig();
        appendToOutput(`[+] ${scriptOnly ? 'Disabled' : 'Enabled'} script only mode.`);
    });

    advanced.addEventListener('click', () => {
        document.querySelectorAll('.advanced-option').forEach(option => {
            option.style.display = 'flex';
            option.offsetHeight;
            option.classList.add('advanced-show');
        });
        advanced.style.display = 'none';
    });

    clearButton.addEventListener('click', () => {
        terminal.innerHTML = '';
        currentFontSize = 14;
        updateFontSize(currentFontSize);
    });

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

    githubBtn.onclick = () => {
        const link = "https://github.com/KOWX712/PlayIntegrityFix/releases/latest";
        toast("Redirecting to " + link);
        setTimeout(() => {
            exec(`am start -a android.intent.action.VIEW -d ${link}`);
        }, 100);
    }
}

// Function to load the version from module.prop
async function loadVersionFromModuleProp() {
    const versionElement = document.getElementById('version-text');
    const { errno, stdout, stderr } = await exec("grep '^version=' /data/adb/modules/playintegrityfix/module.prop | cut -d'=' -f2");
    if (errno === 0) {
        versionElement.textContent = stdout.trim();
    } else {
        appendToOutput(`[!] Failed to read version from module.prop: ${stderr}`, true);
        console.error("Failed to read version from module.prop:", stderr);
    }
    checkDescription();
}

// Check description
async function checkDescription() {
    const unofficialOverlay = document.getElementById('unofficial-warning');
    const { errno } = await exec("grep -q 'tampered' /data/adb/modules/playintegrityfix/module.prop");
    if (typeof ksu !== 'undefined' && errno === 0) {
        unofficialOverlay.style.display = 'flex';
    }
}

// Function to load spoof config
async function loadSpoofConfig() {
    try {
        const { errno, stdout, stderr } = await exec(`
            if [ -f /data/adb/pif.prop ]; then
                cat /data/adb/pif.prop
            else
                cat /data/adb/modules/playintegrityfix/pif.prop
            fi
        `);
        if (errno !== 0) throw new Error(stderr);

        const pifMap = parsePropToMap(stdout);

        spoofConfig.forEach(item => {
            const toggle = document.getElementById(`${item.config}-toggle`);
            toggle.checked = pifMap[item.config];
        });

        if (model === null) model = pifMap.MODEL;
    } catch (error) {
        appendToOutput(`[!] Failed to load spoof config: ${error}`, true);
        appendToOutput('[!] Warning: Do not use third party tools to fetch pif.prop');
        resetPifProp();
        console.error(`Failed to load spoof config:`, error);
    }
}

// Reset pif.prop to default
function resetPifProp() {
    fetch('https://raw.githubusercontent.com/KOWX712/PlayIntegrityFix/inject_s/module/pif.prop')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.text();
        })
        .then(async text => {
            const pifProp = text.trim();
            const { errno, stderr } = await exec(`
                echo '${pifProp}' > /data/adb/modules/playintegrityfix/pif.prop
                rm -f /data/adb/pif.prop || true
            `);
            if (errno === 0) {
                appendToOutput(`[+] Successfully reset pif.prop`);
            } else {
                appendToOutput(`[!] Failed to reset pif.prop: ${stderr}`, true);
            }
        })
        .catch(error => {
            appendToOutput(`[!] Failed to reset pif.prop: ${error.message}`);
        });
}

// Function to setup spoof config button
function setupSpoofConfigButton() {
    spoofConfig.forEach(item => {
        const container = item.config + "-container";
        const toggle = document.getElementById(`${item.config}-toggle`);

        document.getElementById(container).addEventListener('click', async () => {
            if (shellRunning) return;
            muteToggle();
            const { errno, stdout, stderr } = await exec(`
                [ ! -f /data/adb/modules/playintegrityfix/pif.prop ] || echo "/data/adb/modules/playintegrityfix/pif.prop"
                [ ! -f /data/adb/pif.prop ] || echo "/data/adb/pif.prop"
            `);
            if (errno === 0) {
                const isSuccess = await updateSpoofConfig(toggle, item.config, stdout);
                if (isSuccess) {
                    loadSpoofConfig();
                    appendToOutput(`[+] ${toggle.checked ? "Disabled" : "Enabled"} ${item.config}`);
                } else {
                    appendToOutput(`[!] Failed to ${toggle.checked ? "disable" : "enable"} ${item.config}`);
                }
                await exec(`
                    killall com.google.android.gms.unstable || true
                    killall com.android.vending || true
                `);
            } else {
                console.error(`Failed to find pif.prop:`, stderr);
            }
            unmuteToggle();
        });
    });
}

/**
 * Update pif.prop
 * @param {HTMLInputElement} toggle - config toggle of pif.prop
 * @param {string} type - prop key to change
 * @param {string} pifFile - Path of pif.prop list
 * @returns {Promise<boolean>}
 */
async function updateSpoofConfig(toggle, type, pifFile) {
    let isSuccess = true;
    const files = pifFile.split('\n').filter(line => line.trim() !== '');
    
    for (const pifFile of files) {
        try {
            // read
            const { stdout } = await exec(`cat ${pifFile}`);
            const config = parsePropToMap(stdout);

            // update field
            config[type] = !toggle.checked;
            const prop = parseMapToProp(config);

            // write
            const { errno } = await exec(`echo '${prop}' > ${pifFile}`);
            if (errno !== 0) isSuccess = false;

            // reminder
            if (config.spoofVendingBuild && config.spoofVendingSdk) {
                appendToOutput('[!] spoofVendingSdk will not take effect when spoofVendingBuild is enabled.');
            }
        } catch (error) {
            console.error(`Failed to update ${pifFile}:`, error);
            isSuccess = false;
        }
    }
    return isSuccess;
}

// Function to append element in output terminal
function appendToOutput(content, error = false) {
    const output = document.querySelector('.output-terminal-content');
    if (content.trim() === "") {
        const lineBreak = document.createElement('br');
        output.appendChild(lineBreak);
    } else {
        const line = document.createElement('p');
        line.className = 'output-content';
        line.innerHTML = content.replace(/ /g, '&nbsp;');
        if (error) line.style.color = 'red';
        output.appendChild(line);
    }
    output.scrollTop = output.scrollHeight;
}

// Function to run the script and display its output
function runAction() {
    if (shellRunning) return;
    muteToggle();
    let opts = {};
    if (model && product) opts = { env: { MODEL: `"${model}"`, PRODUCT: `"${product}"`} };
    const scriptOutput = spawn("sh", ["/data/adb/modules/playintegrityfix/autopif.sh"], opts);
    scriptOutput.stdout.on('data', (data) => appendToOutput(data));
    scriptOutput.stderr.on('data', (data) => appendToOutput(`[!] Error executing autopif.sh: ${data}`, true));
    scriptOutput.on('exit', () => {
        appendToOutput("");
        unmuteToggle();
    });
    scriptOutput.on('error', () => {
        appendToOutput("[!] Error: Fail to execute autopif.sh", true);
        appendToOutput("");
        unmuteToggle();
    });
}

function updateAutopif() {
    muteToggle();
    const scriptOutput = spawn("sh", ["/data/adb/modules/playintegrityfix/autopif_ota.sh"]);
    scriptOutput.stdout.on('data', (data) => appendToOutput(data));
    scriptOutput.stderr.on('data', (data) => appendToOutput(`[!] Error executing autopif_ota.sh: ${data}`, true));
    scriptOutput.on('exit', () => {
        unmuteToggle();
    });
    scriptOutput.on('error', () => {
        appendToOutput("[!] Error: Fail to execute autopif_ota.sh", true);
        appendToOutput("");
        unmuteToggle();
    });
}

function muteToggle() {
    shellRunning = true;
    document.querySelectorAll('.toggle-list').forEach(toggle => {
        toggle.classList.add('toggle-muted');
    });
}

function unmuteToggle() {
    shellRunning = false;
    document.querySelectorAll('.toggle-list').forEach(toggle => {
        toggle.classList.remove('toggle-muted');
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

/**
 * Simulate MD3 ripple animation
 * Usage: class="ripple-element" style="position: relative; overflow: hidden;"
 * Note: Require background-color to work properly
 * @return {void}
 */
function applyRippleEffect() {
    document.querySelectorAll('.ripple-element').forEach(element => {
        if (element.dataset.rippleListener !== "true") {
            element.addEventListener("pointerdown", async (event) => {
                // Pointer up event
                const handlePointerUp = () => {
                    ripple.classList.add("end");
                    setTimeout(() => {
                        ripple.classList.remove("end");
                        ripple.remove();
                    }, duration * 1000);
                    element.removeEventListener("pointerup", handlePointerUp);
                    element.removeEventListener("pointercancel", handlePointerUp);
                };
                element.addEventListener("pointerup", handlePointerUp);
                element.addEventListener("pointercancel", handlePointerUp);

                const ripple = document.createElement("span");
                ripple.classList.add("ripple");

                // Calculate ripple size and position
                const rect = element.getBoundingClientRect();
                const width = rect.width;
                const size = Math.max(rect.width, rect.height);
                const x = event.clientX - rect.left - size / 2;
                const y = event.clientY - rect.top - size / 2;

                // Determine animation duration
                let duration = 0.2 + (width / 800) * 0.4;
                duration = Math.min(0.8, Math.max(0.2, duration));

                // Set ripple styles
                ripple.style.width = ripple.style.height = `${size}px`;
                ripple.style.left = `${x}px`;
                ripple.style.top = `${y}px`;
                ripple.style.animationDuration = `${duration}s`;
                ripple.style.transition = `opacity ${duration}s ease`;

                // Adaptive color
                const computedStyle = window.getComputedStyle(element);
                const bgColor = computedStyle.backgroundColor || "rgba(0, 0, 0, 0)";
                const isDarkColor = (color) => {
                    const rgb = color.match(/\d+/g);
                    if (!rgb) return false;
                    const [r, g, b] = rgb.map(Number);
                    return (r * 0.299 + g * 0.587 + b * 0.114) < 96; // Luma formula
                };
                ripple.style.backgroundColor = isDarkColor(bgColor) ? "rgba(255, 255, 255, 0.2)" : "";

                // Append ripple
                element.appendChild(ripple);
            });
            element.dataset.rippleListener = "true";
        }
    });
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

function loadScriptOnlyConfig() {
    exec('[ -e "/data/adb/pif_script_only" ]')
        .then(({ errno }) => {
            scriptOnly = errno === 0;
            document.querySelectorAll('.toggle-list').forEach(toggle => {
                if (toggle.classList.contains('advanced-option')
                    && !toggle.classList.contains('advanced-show')
                    || toggle.classList.contains('script-only')
                ) return;
                toggle.style.display = scriptOnly ? 'none' : 'flex';
            });

            const scriptOnlyContainer = document.getElementById('script-only-container');
            scriptOnlyContainer.querySelector('input[type=checkbox]').checked = scriptOnly
            scriptOnlyContainer.querySelector('.toggle').classList.toggle('last-toggle', scriptOnly);
            scriptOnlyContainer.querySelector('.toggle').classList.toggle('first-toggle', scriptOnly);
        });
}

/**
 * fetch available model and array, retrieve from localStorage if last updated less than 1 day
 * @returns {Object} - An object contain an array of model and an array of product
 */
function getDeviceList() {
    const cacheKey = 'PIF_devices_list';
    const tsKey = 'PIF_devices_list_timestamp';
    const oneDayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    let cachedList = localStorage.getItem(cacheKey);
    let cachedTs = localStorage.getItem(tsKey);

    return new Promise(async (resolve) => {
        if (cachedList && cachedTs && (now - parseInt(cachedTs, 10) < oneDayMs)) {
            try {
                resolve(JSON.parse(cachedList));
                return;
            } catch (e) {
                // fallback to refresh if parse fails
            }
        }
        await new Promise(resolve => setTimeout(resolve, 300));
        let listJson = "";
        const result = spawn('sh', ["/data/adb/modules/playintegrityfix/autopif.sh", "--list"]);
        result.stdout.on('data', (data) => {
            if (data.trim() === "" || data.startsWith('[')) return;
            listJson += data.trim();
        });
        result.on('exit', () => {
            if (listJson !== "") {
                localStorage.setItem(cacheKey, listJson);
                localStorage.setItem(tsKey, String(Date.now()));
                try {
                    resolve(JSON.parse(listJson));
                } catch (e) {
                    appendToOutput(`[!] Error parsing devices list: ${e}`, true);
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        });
    });
}

let selectorListener = false;

// Render available device list to select menu
function setupDeviceList() {
    const selectMenu = document.getElementById('select-devices');

    if (!selectorListener) {
        selectMenu.addEventListener('change', () => {
            if (selectMenu.value === 'refresh') {
                localStorage.removeItem('PIF_devices_list');
                localStorage.removeItem('PIF_devices_list_timestamp');
                selectMenu.innerHTML = '<option value=loading>Loading</option>';
                selectMenu.value = 'loading'
                setupDeviceList();
                return;
            }

            const selected = selectMenu.options[selectMenu.selectedIndex];
            model = selected.value || null;
            product = selected.getAttribute('data-product') || null;
        });
        selectorListener = true;
    }

    // Render device list
    getDeviceList().then(deviceList => {
        selectMenu.innerHTML = `
            <option value="random">Random</option>
            <option value="refresh">Refresh List</option>
        `;

        if (!deviceList || !deviceList.model || !deviceList.product) return;
        for (let i = 0; i < deviceList.model.length; i++) {
            const option = document.createElement('option');
            option.value = deviceList.model[i];
            option.textContent = deviceList.model[i];
            option.setAttribute('data-product', deviceList.product[i] || '');
            selectMenu.appendChild(option);
        }

        // Select previous model
        if (model && deviceList.model.includes(model)) {
            selectMenu.value = model;
            selectMenu.dispatchEvent(new Event('change'));
        }
    });
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

document.addEventListener('DOMContentLoaded', async () => {
    checkMMRL();
    appendSpoofConfigToggles();
    loadVersionFromModuleProp();
    await loadSpoofConfig();
    setupSpoofConfigButton();
    loadScriptOnlyConfig();
    setupDeviceList();
    applyRippleEffect();
    updateAutopif();
});

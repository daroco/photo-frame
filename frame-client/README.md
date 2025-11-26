# Photo Frame Client (Arduino/ESP32)

This is the firmware for the physical photo frame hardware that connects to the orchestration server.

## Hardware Requirements

### Minimum Setup
- ESP32 development board (ESP32-DevKit, NodeMCU-32S, or similar)
- TFT Display (320x240 or larger recommended)
- 5V Power supply (USB or dedicated)

### Recommended Setup
- ESP32-DevKit C or NodeMCU-32S
- 2.8" or 3.5" ILI9341 TFT Display (320x240)
- SD Card module (for image caching)
- Enclosure/frame for mounting

### Supported Displays
- ILI9341 (320x240)
- ST7789 (240x240, 240x320)
- ST7735 (128x160, 160x128)
- Any display supported by TFT_eSPI library

## Software Requirements

### Arduino IDE Setup

1. **Install ESP32 Board Support**
   - Open Arduino IDE
   - Go to File → Preferences
   - Add to "Additional Board Manager URLs":
     ```
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
   - Go to Tools → Board → Boards Manager
   - Search for "esp32" and install "esp32 by Espressif Systems"

2. **Install Required Libraries**
   
   Go to Tools → Manage Libraries and install:
   - **ArduinoJson** by Benoit Blanchon (version 6.x)
   - **WebSockets** by Markus Sattler
   - **TFT_eSPI** by Bodmer
   - **JPEGDecoder** by Bodmer (for JPEG support)
   - **PNGdec** by Larry Bank (for PNG support)

### TFT_eSPI Configuration

1. Locate the TFT_eSPI library folder:
   - Windows: `Documents/Arduino/libraries/TFT_eSPI/`
   - Mac: `~/Documents/Arduino/libraries/TFT_eSPI/`
   - Linux: `~/Arduino/libraries/TFT_eSPI/`

2. Edit `User_Setup.h` for your display:

   ```cpp
   // Example for ILI9341
   #define ILI9341_DRIVER
   
   #define TFT_MISO 19
   #define TFT_MOSI 23
   #define TFT_SCLK 18
   #define TFT_CS   5
   #define TFT_DC   4
   #define TFT_RST  2
   
   #define LOAD_GLCD
   #define LOAD_FONT2
   #define LOAD_FONT4
   #define LOAD_FONT6
   #define LOAD_FONT7
   #define LOAD_FONT8
   #define LOAD_GFXFF
   
   #define SPI_FREQUENCY  40000000
   #define SPI_READ_FREQUENCY  20000000
   ```

## Configuration

### WiFi Settings

Edit these lines in `frame-client.ino`:

```cpp
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
```

### Server Settings

```cpp
const char* SERVER_HOST = "192.168.1.100";  // Your server IP
const int SERVER_PORT = 3001;
```

To find your server IP:
- Linux/Mac: `ifconfig` or `ip addr`
- Windows: `ipconfig`

### Frame Settings

```cpp
const char* FRAME_NAME = "Living Room Frame";  // Descriptive name
const int FRAME_WIDTH = 320;   // Your display width
const int FRAME_HEIGHT = 240;  // Your display height
```

## Wiring Diagrams

### ESP32 + ILI9341 TFT (SPI)

```
ESP32 Pin    →    ILI9341 Pin    Function
─────────────────────────────────────────
3.3V         →    VCC            Power
GND          →    GND            Ground
GPIO 18      →    SCK            SPI Clock
GPIO 23      →    MOSI           SPI Data Out
GPIO 19      →    MISO           SPI Data In (optional)
GPIO 5       →    CS             Chip Select
GPIO 4       →    DC/RS          Data/Command
GPIO 2       →    RST            Reset
3.3V         →    LED            Backlight (or via resistor)
```

### With SD Card Module

```
ESP32 Pin    →    SD Card Pin    Function
─────────────────────────────────────────
3.3V         →    VCC            Power
GND          →    GND            Ground
GPIO 18      →    SCK            SPI Clock
GPIO 23      →    MOSI           SPI Data Out
GPIO 19      →    MISO           SPI Data In
GPIO 15      →    CS             Chip Select
```

## Upload Instructions

1. Connect ESP32 to computer via USB
2. Open `frame-client.ino` in Arduino IDE
3. Select your board:
   - Tools → Board → ESP32 Arduino → ESP32 Dev Module
4. Select the correct COM port:
   - Tools → Port → (select your ESP32 port)
5. Click Upload button
6. Monitor serial output:
   - Tools → Serial Monitor (set to 115200 baud)

## Operation

### Startup Sequence

1. **Initialize Display** - Shows startup message
2. **Connect to WiFi** - Connects to configured network
3. **Register with Server** - Sends registration request
4. **Connect WebSocket** - Establishes real-time connection
5. **Fetch Photo** - Downloads and displays assigned photo
6. **Monitor Loop** - Sends heartbeats and checks for updates

### Serial Monitor Output

```
Digital Photo Frame Client
===========================
Display initialized (placeholder)
Connecting to WiFi........
WiFi connected!
IP address: 192.168.1.150
Registering with server...
Registration response: {"id":"abc-123",...}
Frame ID: abc-123
Setting up WebSocket...
WebSocket configured
WebSocket connected
Fetching photo from: http://192.168.1.100:3001/api/frames/abc-123/photo
Mode: individual
New photo URL: http://192.168.1.100:3001/photos/image.jpg
```

### Status Indicators

The frame displays different messages:
- "WiFi Failed" - Cannot connect to WiFi
- "Registration Failed" - Cannot register with server
- "Registered!" - Successfully registered
- "No Photo" - No photo assigned yet
- "Photo Loaded" - Photo successfully displayed

## Troubleshooting

### Problem: Display shows nothing

**Solutions:**
- Check wiring connections
- Verify TFT_eSPI configuration matches your display
- Test with TFT_eSPI example sketches first
- Check display power supply (3.3V or 5V depending on model)

### Problem: WiFi won't connect

**Solutions:**
- Verify SSID and password are correct
- Check if network is 2.4GHz (ESP32 doesn't support 5GHz)
- Move closer to router
- Check for special characters in password
- Monitor serial output for specific error codes

### Problem: Registration fails

**Solutions:**
- Verify server is running (`npm start` in backend folder)
- Check server IP address is correct
- Ensure port 3001 is not blocked by firewall
- Verify ESP32 and server are on same network
- Check serial monitor for HTTP error codes

### Problem: Photos don't download

**Solutions:**
- Verify server URL is accessible from ESP32
- Check photo URL in serial monitor
- Ensure photos are uploaded to server
- Monitor available heap memory (may be too low)
- Try smaller image files first

### Problem: Image display is corrupted

**Solutions:**
- Reduce SPI frequency in TFT_eSPI config
- Check for loose wiring connections
- Verify image format is supported (JPEG/PNG)
- Ensure sufficient memory for image buffer
- Try a different image file

## Performance Tips

1. **Image Format**: JPEG is more memory-efficient than PNG
2. **Image Size**: Match image resolution to display size
3. **Update Frequency**: Increase check intervals to reduce network usage
4. **Caching**: Use SD card to cache images locally
5. **Power**: Use adequate power supply (500mA minimum)

## Advanced Features

### Adding Image Decoding

The provided code includes placeholders for image decoding. To implement:

1. **For JPEG images:**
   ```cpp
   #include <JPEGDecoder.h>
   
   bool decoded = JpegDec.decodeArray(imageData, imageSize);
   // Render to display
   ```

2. **For PNG images:**
   ```cpp
   #include <PNGdec.h>
   
   PNG png;
   png.open(imageData, imageSize, pngDrawCallback);
   png.decode(NULL, 0);
   ```

### Adding SD Card Caching

```cpp
#include <SD.h>

// Save to SD
File file = SD.open("/cache/photo.jpg", FILE_WRITE);
file.write(imageData, imageSize);
file.close();

// Load from SD
file = SD.open("/cache/photo.jpg", FILE_READ);
```

### Custom Display Modes

Modify `downloadAndDisplayPhoto()` to add:
- Image scaling/cropping
- Rotation
- Filters/effects
- Slideshow transitions

## Hardware Alternatives

### Using Arduino with WiFi Shield
- Use Arduino Mega + WiFi Shield instead of ESP32
- Requires more wiring but same basic code
- May need memory optimization

### Using Raspberry Pi Zero W
- More powerful, runs Python/Node.js
- Can use HDMI display instead of TFT
- No Arduino IDE needed
- Higher cost but more features

### Using ESP8266
- Cheaper alternative to ESP32
- Less memory (may need optimization)
- Same WiFi capabilities
- Works with most code (minor changes needed)

## Support

For issues with:
- **Hardware**: Check wiring against diagrams
- **Software**: Monitor serial output at 115200 baud
- **Server**: Check backend logs
- **General**: See main README.md

## License

MIT

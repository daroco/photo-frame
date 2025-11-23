/*
 * Digital Photo Frame Client for ESP32
 * 
 * This sketch turns an ESP32 with a display into a networked photo frame
 * that automatically registers with the server and displays photos.
 * 
 * Hardware Requirements:
 * - ESP32 board (ESP32-DevKit, NodeMCU-32S, or similar)
 * - TFT Display (ILI9341, ST7789, or similar)
 * - SD Card module (optional, for caching)
 * 
 * Libraries Required:
 * - WiFi (built-in)
 * - HTTPClient (built-in)
 * - ArduinoJson
 * - TFT_eSPI (configured for your display)
 * - WebSockets by Markus Sattler
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>

// WiFi Configuration
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Server Configuration
const char* SERVER_HOST = "192.168.1.100";  // Replace with your server IP
const int SERVER_PORT = 3001;
const char* API_ENDPOINT = "/api";

// Frame Configuration
String frameId = "";
const char* FRAME_NAME = "Photo Frame 1";
const int FRAME_WIDTH = 800;
const int FRAME_HEIGHT = 600;

// Update intervals
const unsigned long HEARTBEAT_INTERVAL = 30000;  // 30 seconds
const unsigned long PHOTO_CHECK_INTERVAL = 60000;  // 1 minute

unsigned long lastHeartbeat = 0;
unsigned long lastPhotoCheck = 0;

WebSocketsClient webSocket;
bool wsConnected = false;

// Current photo info
String currentPhotoUrl = "";
String currentMode = "individual";  // "individual" or "overlay"

void setup() {
  Serial.begin(115200);
  Serial.println("\n\nDigital Photo Frame Client");
  Serial.println("===========================");
  
  // Initialize display
  initDisplay();
  
  // Connect to WiFi
  connectWiFi();
  
  // Register with server
  registerFrame();
  
  // Connect WebSocket
  setupWebSocket();
  
  // Initial photo fetch
  fetchPhoto();
}

void loop() {
  // Handle WebSocket
  webSocket.loop();
  
  unsigned long currentMillis = millis();
  
  // Send heartbeat
  if (currentMillis - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = currentMillis;
    sendHeartbeat();
  }
  
  // Check for photo updates
  if (currentMillis - lastPhotoCheck >= PHOTO_CHECK_INTERVAL) {
    lastPhotoCheck = currentMillis;
    fetchPhoto();
  }
  
  delay(100);
}

void connectWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi connection failed!");
    displayMessage("WiFi Failed", "Check credentials");
  }
}

void registerFrame() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Cannot register: No WiFi");
    return;
  }
  
  HTTPClient http;
  String url = String("http://") + SERVER_HOST + ":" + SERVER_PORT + API_ENDPOINT + "/frames/register";
  
  Serial.println("Registering with server...");
  Serial.println("URL: " + url);
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  // Create JSON payload
  StaticJsonDocument<256> doc;
  doc["name"] = FRAME_NAME;
  doc["ip_address"] = WiFi.localIP().toString();
  doc["width"] = FRAME_WIDTH;
  doc["height"] = FRAME_HEIGHT;
  
  String payload;
  serializeJson(doc, payload);
  
  int httpResponseCode = http.POST(payload);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Registration response: " + response);
    
    // Parse response to get frame ID
    StaticJsonDocument<512> responseDoc;
    DeserializationError error = deserializeJson(responseDoc, response);
    
    if (!error) {
      frameId = responseDoc["id"].as<String>();
      Serial.println("Frame ID: " + frameId);
      displayMessage("Registered!", "ID: " + frameId);
    }
  } else {
    Serial.print("Registration failed: ");
    Serial.println(httpResponseCode);
    displayMessage("Registration Failed", "Error: " + String(httpResponseCode));
  }
  
  http.end();
}

void setupWebSocket() {
  Serial.println("Setting up WebSocket...");
  
  webSocket.begin(SERVER_HOST, SERVER_PORT, "/");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
  
  Serial.println("WebSocket configured");
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("WebSocket disconnected");
      wsConnected = false;
      break;
      
    case WStype_CONNECTED:
      Serial.println("WebSocket connected");
      wsConnected = true;
      
      // Send registration message
      if (frameId != "") {
        StaticJsonDocument<128> doc;
        doc["type"] = "register";
        doc["frameId"] = frameId;
        
        String message;
        serializeJson(doc, message);
        webSocket.sendTXT(message);
      }
      break;
      
    case WStype_TEXT:
      Serial.printf("WebSocket message: %s\n", payload);
      handleWebSocketMessage((char*)payload);
      break;
  }
}

void handleWebSocketMessage(const char* message) {
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    Serial.println("Failed to parse WebSocket message");
    return;
  }
  
  const char* type = doc["type"];
  
  if (strcmp(type, "photo_updated") == 0) {
    Serial.println("Photo updated, fetching new photo...");
    fetchPhoto();
  } else if (strcmp(type, "mode_changed") == 0) {
    Serial.println("Mode changed, fetching photo...");
    fetchPhoto();
  } else if (strcmp(type, "layout_updated") == 0) {
    Serial.println("Layout updated, fetching photo...");
    fetchPhoto();
  }
}

void sendHeartbeat() {
  if (!wsConnected || frameId == "") return;
  
  StaticJsonDocument<128> doc;
  doc["type"] = "heartbeat";
  doc["frameId"] = frameId;
  
  String message;
  serializeJson(doc, message);
  webSocket.sendTXT(message);
}

void fetchPhoto() {
  if (WiFi.status() != WL_CONNECTED || frameId == "") {
    Serial.println("Cannot fetch photo: No WiFi or frame ID");
    return;
  }
  
  HTTPClient http;
  String url = String("http://") + SERVER_HOST + ":" + SERVER_PORT + API_ENDPOINT + "/frames/" + frameId + "/photo";
  
  Serial.println("Fetching photo from: " + url);
  
  http.begin(url);
  int httpResponseCode = http.GET();
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    
    StaticJsonDocument<1024> doc;
    DeserializationError error = deserializeJson(doc, response);
    
    if (!error) {
      const char* mode = doc["mode"];
      currentMode = String(mode);
      
      Serial.println("Mode: " + currentMode);
      
      if (!doc["photo"].isNull()) {
        JsonObject photo = doc["photo"];
        String photoUrl = String("http://") + SERVER_HOST + ":" + SERVER_PORT + photo["url"].as<String>();
        
        if (photoUrl != currentPhotoUrl) {
          currentPhotoUrl = photoUrl;
          Serial.println("New photo URL: " + photoUrl);
          
          if (currentMode == "overlay") {
            JsonObject viewport = doc["viewport"];
            float vp_x = viewport["x"];
            float vp_y = viewport["y"];
            float vp_width = viewport["width"];
            float vp_height = viewport["height"];
            
            Serial.printf("Viewport: x=%.2f, y=%.2f, w=%.2f, h=%.2f\n", vp_x, vp_y, vp_width, vp_height);
            downloadAndDisplayPhoto(photoUrl, true, vp_x, vp_y, vp_width, vp_height);
          } else {
            downloadAndDisplayPhoto(photoUrl, false, 0, 0, 0, 0);
          }
        }
      } else {
        Serial.println("No photo assigned");
        displayMessage("No Photo", "Assign a photo in the UI");
      }
    }
  } else {
    Serial.print("Failed to fetch photo: ");
    Serial.println(httpResponseCode);
  }
  
  http.end();
}

void downloadAndDisplayPhoto(String url, bool isOverlay, float vp_x, float vp_y, float vp_width, float vp_height) {
  Serial.println("Downloading photo from: " + url);
  
  HTTPClient http;
  http.begin(url);
  
  int httpCode = http.GET();
  if (httpCode == HTTP_CODE_OK) {
    int len = http.getSize();
    Serial.printf("Photo size: %d bytes\n", len);
    
    // TODO: Implement actual image decoding and display
    // This is a placeholder - you'll need to:
    // 1. Download the image data
    // 2. Decode JPEG/PNG (using JPEGDecoder or PNGdec library)
    // 3. If overlay mode, crop/scale to viewport coordinates
    // 4. Display on your TFT screen
    
    displayMessage("Photo Loaded", isOverlay ? "Overlay Mode" : "Individual Mode");
    
    Serial.println("Photo displayed successfully");
  } else {
    Serial.printf("Failed to download photo: %d\n", httpCode);
    displayMessage("Download Failed", "Error: " + String(httpCode));
  }
  
  http.end();
}

void initDisplay() {
  // TODO: Initialize your specific display
  // Example for TFT_eSPI:
  // tft.init();
  // tft.setRotation(1);
  // tft.fillScreen(TFT_BLACK);
  
  Serial.println("Display initialized (placeholder)");
}

void displayMessage(String title, String message) {
  // TODO: Display text on your screen
  // Example for TFT_eSPI:
  // tft.fillScreen(TFT_BLACK);
  // tft.setTextColor(TFT_WHITE);
  // tft.setTextSize(2);
  // tft.setCursor(10, 50);
  // tft.println(title);
  // tft.setCursor(10, 100);
  // tft.println(message);
  
  Serial.println("Display: " + title + " - " + message);
}

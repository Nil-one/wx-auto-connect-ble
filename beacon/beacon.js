Page({
  data: {
    connected: false,
    deviceId: null
  },

  onLoad() {
    // 初始化蓝牙模块
    wx.openBluetoothAdapter({
      success: (res) => {
        console.log('Bluetooth adapter initialized successfully', res);
        this.startBluetooth();
      },
      fail: (err) => {
        console.error('Bluetooth adapter initialization failed', err);
      }
    });

    // 监听蓝牙适配器状态变化
    wx.onBluetoothAdapterStateChange((res) => {
      console.log('Bluetooth adapter state changed', res);
    });

    // 监听外围设备连接状态变化
    wx.onBLEPeripheralConnectionStateChanged((res) => {
      console.log(`Device ${res.deviceId} is ${res.connected ? 'connected' : 'disconnected'}`);
      this.setData({
        connected: res.connected,
        deviceId: res.deviceId
      });
    });
  },

  startBluetooth() {
    // 创建 BLE 外围设备服务器
    wx.createBLEPeripheralServer({
      success: (res) => {
        console.log('BLE Peripheral Server created', res);
        const server = res.server;

        // 添加服务和特征值
        server.addService({
          service: {
            uuid: '10000000-0000-0000-0000-000000000000', // 自定义服务 UUID
            characteristics: [
              {
                uuid: '11000000-0000-0000-0000-000000000000', // 读特征值 UUID
                properties: {
                  read: true,
                  notify: true
                },
                permission: {
                  read: true,
                  write: false,
                  notify: true,
                  indicate: false
                },
                value: new ArrayBuffer(1) // 初始值
              },
              {
                uuid: '12000000-0000-0000-0000-000000000000', // 写特征值 UUID
                properties: {
                  write: true
                },
                permission: {
                  read: false,
                  write: true,
                  notify: false,
                  indicate: false
                },
                value: new ArrayBuffer(1) // 初始值
              }
            ]
          },
          success: (res) => {
            console.log('Service added successfully', res);

            // 监听特征值写操作
            server.onCharacteristicWriteRequest((result) => {
              console.log('Characteristic write request received', result);
              const { serviceId, characteristicId, value, needResponse } = result;
              if (characteristicId === '12000000-0000-0000-0000-000000000000') {
                // 处理写入的数据
                const dataView = new DataView(value);
                const receivedValue = dataView.getUint8(0); // 假设数据是一个字节
                console.log('Received value:', receivedValue);

                // 立即写回数据
                const responseValue = new ArrayBuffer(1);
                const responseDataView = new DataView(responseValue);
                responseDataView.setUint8(0, receivedValue); // 回写相同的数据

                server.writeCharacteristicValue({
                  serviceId,
                  characteristicId,
                  value: responseValue,
                  needResponse,
                  success: (res) => {
                    console.log('Write characteristic value success', res);
                  },
                  fail: (err) => {
                    console.error('Write characteristic value failed', err);
                  }
                });
              }
            });

            // 开始广播
            server.startAdvertising({
              advertiseRequest: {
                connectable: true,
                serviceUuids: ['10000000-0000-0000-0000-000000000000']
              },
              success: (res) => {
                console.log('Advertising started successfully', res);
              },
              fail: (err) => {
                console.error('Failed to start advertising', err);
              }
            });
          },
          fail: (err) => {
            console.error('Failed to add service', err);
          }
        });
      },
      fail: (err) => {
        console.error('Failed to create BLE Peripheral Server', err);
      }
    });
  },

  stopBluetooth() {
    // 停止广播
    wx.closeBluetoothAdapter({
      success: (res) => {
        console.log('Bluetooth adapter closed successfully', res);
        this.setData({
          connected: false,
          deviceId: null
        });
      },
      fail: (err) => {
        console.error('Failed to close Bluetooth adapter', err);
      }
    });
  }
});
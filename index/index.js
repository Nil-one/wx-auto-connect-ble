const app = getApp();

function arrayBufferToString(buffer) {
  const uint8Array = new Uint8Array(buffer);
  let utf8String = '';

  for (let i = 0; i < uint8Array.length; i++) {
      utf8String += '%' + ('0' + uint8Array[i].toString(16)).slice(-2);
  }

  return decodeURIComponent(utf8String);
}

function inArray(arr, key, val) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i][key] === val) {
      return i;
    }
  }
  return -1;
}

// ArrayBuffer转16进度字符串示例
function ab2hex(buffer) {
  var hexArr = Array.prototype.map.call(
    new Uint8Array(buffer),
    function (bit) {
      return ('00' + bit.toString(16)).slice(-2)
    }
  )
  return hexArr.join('');
}

const FIXED_SERVICE_UUID = "10000000-0000-0000-0000-000000000000";


Page({
  data: {
    devices: [],
    connected: false,
    chs: [],
  },
  onLoad() {
    setTimeout(() => {
      this.openBluetoothAdapter();
    }, 1000); // 延迟 1 秒
  },
  openBluetoothAdapter() {
    console.log("开始扫描")
    wx.openBluetoothAdapter({
      success: (res) => {
        console.log('openBluetoothAdapter success', res)
        this.startBluetoothDevicesDiscovery()
      },
      fail: (res) => {
        if (res.errCode === 10001) {
          wx.onBluetoothAdapterStateChange((res) => {
            console.log('onBluetoothAdapterStateChange', res)
            if (res.available) {
              this.startBluetoothDevicesDiscovery()
            }
          })
        }
      }
    })
  },
  getBluetoothAdapterState() {
    wx.getBluetoothAdapterState({
      success: (res) => {
        console.log('getBluetoothAdapterState', res)
        if (res.discovering) {
          this.onBluetoothDeviceFound()
        } else if (res.available) {
          this.startBluetoothDevicesDiscovery()
        }
      }
    })
  },
  startBluetoothDevicesDiscovery() {
    if (this._discoveryStarted) {
      return
    }
    this._discoveryStarted = true
    wx.startBluetoothDevicesDiscovery({
      allowDuplicatesKey: true,
      success: (res) => {
        console.log('startBluetoothDevicesDiscovery success', res)
        this.onBluetoothDeviceFound()
      },
    })
  },
  stopBluetoothDevicesDiscovery() {
    wx.stopBluetoothDevicesDiscovery()
  },
  onBluetoothDeviceFound() {
    wx.onBluetoothDeviceFound((res) => {
      res.devices.forEach(device => {
        if (!device.name && !device.localName) {
          return
        }
        console.log('Found device:', device);
        // 自动连接到特定设备（根据设备名称或服务 UUID）
        if (device.deviceId === app.globalData.connectedDeviceId || device.serviceId === app.globalData.serviceId) {
          this.createBLEConnection(device.deviceId,device.name);
        }
      });
    });
  },
  createBLEConnection(deviceId,name) {
    wx.createBLEConnection({
      deviceId,
      success: (res) => {
        console.log('设备连接成功');
        this.setData({
          connected: true,
          name,
          deviceId,
        });
        app.globalData.connectedDeviceId = deviceId;
        this.getBLEDeviceServices(deviceId);
      },
      fail: (res) => {
        console.error('设备连接失败', res);
      }
    });
    this.stopBluetoothDevicesDiscovery();
  },
  closeBLEConnection() {
    wx.closeBLEConnection({
      deviceId: this.data.deviceId
    })
    this.setData({
      connected: false,
      chs: [],
      canWrite: false,
    })
  },
  getBLEDeviceServices(deviceId) {
    wx.getBLEDeviceServices({
      deviceId,
      success: (res) => {
        this.setData({
          services: res.services
        });
        for (let i = 0; i < res.services.length; i++) {
          if (res.services[i].uuid === FIXED_SERVICE_UUID) {
            this.getBLEDeviceCharacteristics(deviceId, FIXED_SERVICE_UUID)
            return
          }
        }
      }
    })
  },
  getBLEDeviceCharacteristics(deviceId, serviceId) {
    wx.getBLEDeviceCharacteristics({
      deviceId,
      serviceId,
      success: (res) => {
        console.log('getBLEDeviceCharacteristics success', res.characteristics)
        for (let i = 0; i < res.characteristics.length; i++) {
          let item = res.characteristics[i]
          if (item.properties.read) {
            wx.readBLECharacteristicValue({
              deviceId,
              serviceId,
              characteristicId: item.uuid,
            })
          }
          if (item.properties.write) {
            this.setData({
              canWrite: true
            })
            app.globalData.serviceId = serviceId;
            app.globalData.characteristicId = item.uuid;
          }
          if (item.properties.notify || item.properties.indicate) {
            wx.notifyBLECharacteristicValueChange({
              deviceId,
              serviceId,
              characteristicId: item.uuid,
              state: true,
            })
          }
        }
      },
      fail(res) {
        console.error('getBLEDeviceCharacteristics', res)
      }
    })

    wx.notifyBLECharacteristicValueChange({
      deviceId: deviceId,
      serviceId: serviceId,
      characteristicId: "11000000-0000-0000-0000-000000000000",
      state: true,
      success: (res2) => {
        console.log('监听特征值成功', res2)
      },
      fail: (res2) => {
        console.log("notify fail", res2)
      },
      complete: (res2) => {
        wx.onBLECharacteristicValueChange((characteristic) => {
          const data = Array.prototype.slice.call(new Uint8Array(characteristic.value))
          console.log('设备返回的特征值', arrayBufferToString(characteristic.value))

          // 将接收到的数据转换为Uint8Array
          const receivedData = new Uint8Array(characteristic.value);

          // 将数据追加到全局缓冲区
          let globalBuffer = app.globalData.globalBuffer;
          globalBuffer = globalBuffer.concat(Array.from(receivedData));
          app.globalData.globalBuffer = globalBuffer;
        })
      }
    })
    // 操作之前先监听，保证第一时间获取数据
    wx.onBLECharacteristicValueChange((characteristic) => {
      const idx = inArray(this.data.chs, 'uuid', characteristic.characteristicId)
      const data = {}
      if (idx === -1) {
        data[`chs[${this.data.chs.length}]`] = {
          uuid: characteristic.characteristicId,
          value: ab2hex(characteristic.value)
        }
      } else {
        data[`chs[${idx}]`] = {
          uuid: characteristic.characteristicId,
          value: ab2hex(characteristic.value)
        }
      }
      this.setData(data)
      console.log('characteristic value changed:', characteristic);
      let hexData = ab2hex(characteristic.value); // 将ArrayBuffer转换为16进制字符串
      console.log('Received data:', arrayBufferToString(characteristic.value));
    })
  },
  writeBLECharacteristicValue() {
    const targetDeviceId = this.data.deviceId;
    // 观测已经连接的设备
    wx.getConnectedBluetoothDevices({
      services: ["10000000-0000-0000-0000-000000000000"],  // 这里的serviceId是你关心的蓝牙服务的UUID
      success: function (res) {
        console.log(res.devices);
        var isConnected = res.devices.some(device => device.deviceId === targetDeviceId);
        console.log('设备连接状态：', isConnected ? '已连接' : '未连接');
      },
      fail: function (err) {
        console.error('获取已连接设备失败', err);
      }
    });

    console.log("开始写入数据...");
    console.log("this.serviceId:" + this._serviceId);
    console.log("this.deviceId:" + this._deviceId);
    console.log("this.characteristicId:" + this._characteristicId);
    this.showInputDialog();
  },
  closeBluetoothAdapter() {
    wx.closeBluetoothAdapter()
    this._discoveryStarted = false
  },
  showInputDialog() {
    wx.showModal({
      title: '输入数据',
      editable: true,
      placeholderText: '请输入要发送的数据',
      success: (res) => {
        if (res.confirm) {
          const inputStr = res.content; // 获取用户输入的数据
          console.log("要发送的数据：" + inputStr);
          this.sendData(inputStr);
        }
      }
    });
  },
  sendData(inputStr) {
    const buffer = new ArrayBuffer(inputStr.length); // 创建一个长度为字符串长度的ArrayBuffer
    const dataView = new DataView(buffer);
    for (let i = 0; i < inputStr.length; i++) {
      dataView.setUint8(i, inputStr.charCodeAt(i)); // 将字符串转换为字节并写入ArrayBuffer
    }
    wx.writeBLECharacteristicValue({
      deviceId: this._deviceId,
      serviceId: this._serviceId,
      characteristicId: this._characteristicId,
      value: buffer,
      success: (res) => {
        console.log('writeBLECharacteristicValue success', res);
      },
      fail: (res) => {
        console.error('writeBLECharacteristicValue fail', res);
      }
    });
  },
});

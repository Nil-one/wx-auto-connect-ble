const app = getApp()

function arrayBufferToString(buffer) {
  const uint8Array = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < uint8Array.length; i++) {
    str += String.fromCharCode(uint8Array[i]);
  }
  return str;
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
  openBluetoothAdapter() {
    console.log("开始扫描")
    wx.openBluetoothAdapter({
      success: (res) => {
        console.log('openBluetoothAdapter success', res)
        this.startBluetoothDevicesDiscovery()
      },
      fail: (res) => {
        if (res.errCode === 10001) {
          wx.onBluetoothAdapterStateChange(function (res) {
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
        const foundDevices = this.data.devices
        const idx = inArray(foundDevices, 'deviceId', device.deviceId)
        const data = {}
        if (idx === -1) {
          data[`devices[${foundDevices.length}]`] = device
        } else {
          data[`devices[${idx}]`] = device
        }
        this.setData(data)
      })
    })
  },
  createBLEConnection(e) {
    const ds = e.currentTarget.dataset
    const deviceId = ds.deviceId
    const name = ds.name
    wx.createBLEConnection({
      deviceId,
      success: (res) => {
        console.log('设备连接成功');
        this.setData({
          connected: true,
          name,
          deviceId,
        })
        this.getBLEDeviceServices(deviceId)
      }
    })
    this.stopBluetoothDevicesDiscovery()
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
            this._deviceId = deviceId
            this._serviceId = serviceId
            this._characteristicId = item.uuid
            // this.writeBLECharacteristicValue()
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
      deviceId:deviceId,
      serviceId:serviceId,
      characteristicId: "11000000-0000-0000-0000-000000000000",
      state: true,
      success:(res2) =>{   
        console.log('监听特征值成功',res2)  
      },
      fail:(res2) => {
        console.log("notify fail", res2)
      },
      complete:(res2) =>{                      
        wx.onBLECharacteristicValueChange((characteristic) => {
          const data = Array.prototype.slice.call(new Uint8Array(characteristic.value ))
          console.log('设备返回的特征值',arrayBufferToString(characteristic.value))
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
      // data[`chs[${this.data.chs.length}]`] = {
      //   uuid: characteristic.characteristicId,
      //   value: ab2hex(characteristic.value)
      // }
      this.setData(data)
      console.log('characteristic value changed:', characteristic);
      // let decoder = new TextDecoder("utf-8");
      let hexData = ab2hex(characteristic.value); // 将ArrayBuffer转换为16进制字符串
      console.log('Received data:',arrayBufferToString(characteristic.value) );
    })
  },
  writeBLECharacteristicValue() {
    const targetDeviceId = this.data.deviceId;
    // 观测已经连接的设备
    wx.getConnectedBluetoothDevices({
      services: ["10000000-0000-0000-0000-000000000000"],  // 这里的serviceId是你关心的蓝牙服务的UUID
      success: function(res) {
        console.log(res.devices);
        var isConnected = res.devices.some(device => device.deviceId === targetDeviceId);
        console.log('设备连接状态：', isConnected ? '已连接' : '未连接');
      },
      fail: function(err) {
        console.error('获取已连接设备失败', err);
      }
    });

    console.log("开始写入数据...");
    console.log("this.serviceId:"+this._serviceId);
    console.log("this.deviceId:"+this._deviceId);
    console.log("this.characteristicId:"+this._characteristicId);
    // 向蓝牙设备发送一个0x00的16进制数据
    // let buffer = new ArrayBuffer(1)
    // let dataView = new DataView(buffer);
    // let randomData = Math.random() * 255 | 0;
    // dataView.setUint8(0, randomData)
    // console.log("dataView-data:"+randomData);
    // wx.writeBLECharacteristicValue({
    //   deviceId: this._deviceId,
    //   serviceId: this._serviceId,
    //   characteristicId: this._characteristicId,
    //   value: buffer,
    // })
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
          console.log("要发送的数据："+inputStr);
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
  
})

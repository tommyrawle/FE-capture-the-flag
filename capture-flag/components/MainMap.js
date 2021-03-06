import React, { Component } from "react";
import {
  Platform,
  Text,
  View,
  StyleSheet,
  Dimensions,
  TouchableHighlight,
  Alert,
  AsyncStorage,
  ActivityIndicator
} from "react-native";
import { Constants, Location, Permissions, MapView } from "expo";
import randomLocation from "random-location";
import { FontAwesome } from "@expo/vector-icons";
import { Drawer } from "native-base";
import geolib from "geolib";
import * as api from "../api";
import Flag from "./Flag";
import HeaderBar from "./HeaderBar";
import SideBar from "./SideBar";
import Scoreboard from "./Scoreboard";
import { YellowBox } from "react-native";
import styles from '../assets/style/mainStyle'
YellowBox.ignoreWarnings(["Require cycle:"]);
Drawer.defaultProps.styles.mainOverlay.elevation = 0;

export default class MainMap extends Component {
  state = {
    errorMessage: null,
    loading: true,
    lat: 0,
    long: 0,
    nearFlag: false,
    flagCaptured: false,
    flagGenerated: false,
    flagLat: 0,
    flagLong: 0,
    score: 0,
    zoneLat: 0,
    zoneLong: 0,
    nearZone: false,
    username: "",
    flagDistance: 0,
    dropFlagCount: 0
  };
  componentWillMount() {
    console.log("mounting");
    Expo.Font.loadAsync({
      Roboto: require("native-base/Fonts/Roboto.ttf"),
      Roboto_medium: require("native-base/Fonts/Roboto_medium.ttf")
    }).then(() => {
      if (Platform.OS === "android" && !Constants.isDevice) {
        this.setState({
          errorMessage:
            "Oops, this will not work on Sketch in an Android emulator. Try it on your device!"
        });
      } else {
        this._getInitialLocation()
        // this._getLocationAsync()
        //   .then(() => 
        AsyncStorage.getItem("mainUser")
        .then(userObj => {
          const newMainObj = JSON.parse(userObj);
          return newMainObj})
        .then(user => {
          return api.getUser(user.username)})
        .then(user => this.setState({ ...user }))
        .then(() => this._beginWatchingLocation());
        }  
    });
  }
  componentDidUpdate(prevProps, prevState) {
    if (
      prevState.lat !== this.state.lat &&
      prevState.long !== this.state.long
    ) {
      if (!this.state.flagGenerated) {
        this.generateFlag(this.state.username);
      }
    }
  }
  _getInitialLocation = async () => {
    let { status } = await Permissions.askAsync(Permissions.LOCATION);
    if (status !== 'granted') {
      this.setState({
        errorMessage: 'Permission to access location was denied',
      });
    }

    let location = await Location.getCurrentPositionAsync({});
    this.setState({ 
      lat: location.coords.latitude,
      long: location.coords.longitude,
      loading: false
     });
  }
  _beginWatchingLocation = async () => {
    let { status } = await Permissions.askAsync(Permissions.LOCATION);
    if (status !== "granted") {
      this.setState({
        errorMessage: "Permission to access location was denied"
      });
    }
    this.newLocation = await Location.watchPositionAsync(
      { distanceInterval: 5 },
      this.locationChanged
    );
  };
  locationChanged = location => {
    if (this.state.lat !== location.coords.latitude) {
      this.setState({
        lat: location.coords.latitude,
        long: location.coords.longitude,
        loading: false
      });
      this.getDistanceFromFlag();
      if (this.amInsideRadius()) {
        this.amINear();
      } else {
        this.generateFlag(this.state.username);
      }
      if (this.state.flagCaptured) {
        this.dropFlag();
      }
    }
  };
  generateFlag = username => {
    const flagCoordinate = {
      latitude: randomLocation.randomCirclePoint(
        { latitude: this.state.lat, longitude: this.state.long },
        100
      ).latitude,
      longitude: randomLocation.randomCirclePoint(
        { latitude: this.state.lat, longitude: this.state.long },
        100
      ).longitude
    };
    api.patchFlagLocation(
      username,
      flagCoordinate.latitude,
      flagCoordinate.longitude
    );
    this.setState({
      flagLat: flagCoordinate.latitude,
      flagLong: flagCoordinate.longitude,
      flagGenerated: true
    });
  };

  generateZone = username => {
    const zoneCoordinate = {
      latitude: randomLocation.randomCirclePoint(
        { latitude: this.state.flagLat, longitude: this.state.flagLong },
        100
      ).latitude,
      longitude: randomLocation.randomCirclePoint(
        { latitude: this.state.flagLat, longitude: this.state.flagLong },
        100
      ).longitude
    };
    api.patchZoneLocation(
      username,
      zoneCoordinate.latitude,
      zoneCoordinate.longitude
    );
    this.setState({
      zoneLat: zoneCoordinate.latitude,
      zoneLong: zoneCoordinate.longitude
    });
  };

  captureFlag = () => {
    if (this.state.nearFlag) {
      Alert.alert(
        "Collect Flag",
        "Collect Flag",
        [
          {
            text: "Capture the flag",
            onPress: () => {
              this.incrementScore(5)
              api.patchFlagCapture(
                this.state.username,
                this.state.flagLong,
                this.state.flagLat
              );
              this.generateZone(this.state.username);
              this.setState({
                flagCaptured: true,
                
              });
            }
          },
          {
            text: "Leave the flag",
            onPress: () => console.log("Cancel Pressed"),
            style: "cancel"
          }
        ],
        { cancelable: false }
      );
    }
  };
  dropFlag = () => {
    if (this.state.nearZone) {
      this.incrementScore(10);
      this.incrementFlagCount();
      this.setState({
        flagCaptured: false,
        flagGenerated: false
      });
      this.generateFlag(this.state.username);
    }
  };
  incrementScore = (scoreUpdate) => {
    api.patchScore(this.state.username, scoreUpdate);
    this.setState({
      score: this.state.score + scoreUpdate
    });
  };
  incrementFlagCount = () => {
    api.patchFlagCount(this.state.username);
    this.setState({
      dropFlagCount: this.state.dropFlagCount+1
    });
  };
  amINear = () => {
    let flag = geolib.isPointInCircle(
      { latitude: this.state.lat, longitude: this.state.long },
      { latitude: this.state.flagLat, longitude: this.state.flagLong },
      20
    );
    let zone = geolib.isPointInCircle(
      { latitude: this.state.lat, longitude: this.state.long },
      { latitude: this.state.zoneLat, longitude: this.state.zoneLong },
      20
    );
    this.setState({
      nearFlag: flag,
      nearZone: zone
    });
  };
  getDistanceFromFlag = () => {
    let distance = geolib.getDistance(
      { latitude: this.state.lat, longitude: this.state.long },
      { latitude: this.state.flagLat, longitude: this.state.flagLong },
      null,
      1
    );
    console.log(distance);
    return distance;
  };
  amInsideRadius = () => {
    let inOrOut = geolib.isPointInCircle(
      { latitude: this.state.lat, longitude: this.state.long },
      { latitude: this.state.flagLat, longitude: this.state.flagLong },
      500
    ); //false means outside radius
    return inOrOut;
  };

  logOutUser = () => {
    this.newLocation.remove();
    AsyncStorage.removeItem("mainUser");
    this.props.navigation.navigate("Login");
  };
  handleRecenter = () => {
    this.map.animateToRegion(this.userLocationWithDelta(), 500);
  };
  closeUserDrawer = () => {
    this.UserDrawer._root.close();
  };
  openUserDrawer = () => {
    this.UserDrawer._root.open();
  };
  closeScoreDrawer = () => {
    this.ScoreDrawer._root.close();
  };
  openScoreDrawer = () => {
    this.ScoreDrawer._root.open();
  };
  userLocationWithDelta = () => {
    const { lat, long } = this.state;
    const screen = Dimensions.get("window");
    const ASPECT_RATIO = screen.width / screen.height;
    const latitudeDelta = 0.005;
    const longitudeDelta = latitudeDelta * ASPECT_RATIO;
    const userLocation = {
      latitude: lat,
      longitude: long,
      latitudeDelta,
      longitudeDelta
    };
    return userLocation;
  };

  render() {
    console.log(this.state.flagLat, "flaglat inside render");
    if (this.state.loading)
      return (
        <View style={styles.loadingScreen}>
        <ActivityIndicator size='large' color="#ffffff" />
      </View>
      );
    else {
      const { name, username, score, dropFlagCount } = this.state;
      return (
        <View style={{ flex: 1 }}>
          <Drawer
            ref={ref => {
              this.UserDrawer = ref;
            }}
            content={
              <SideBar
                logOut={this.logOutUser}
                getDistanceFromFlag={this.getDistanceFromFlag}
                score={score} name={name} username={username} dropFlagCount={dropFlagCount}
              />
            }
            side="left"
            onClose={() => this.closeUserDrawer()}
          >
            <Drawer
              ref={ref => {
                this.ScoreDrawer = ref;
              }}
              content={<Scoreboard />}
              // openDrawerOffset={100}
              side="right"
              onClose={() => this.closeScoreDrawer()}
            >
              <View style={{ flex: 1 }}>
                <HeaderBar
                  openUserDrawer={this.openUserDrawer.bind(this.UserDrawer)}
                  openScoreDrawer={this.openScoreDrawer.bind(this.ScoreDrawer)}
                  score={this.state.score}
                />

                <MapView
                  ref={map => {
                    this.map = map;
                  }}
                  style={{ flex: 1 }}
                  initialRegion={this.userLocationWithDelta()}
                  title={"capture flag"}
                  showsUserLocation={true}
                  followUserLocation={true}
                >
                  {/* FLAG COMPONENT */}
                  {!this.state.flagCaptured && (
                    <Flag
                      captureFlag={this.captureFlag}
                      nearFlag={this.state.nearFlag}
                      flagLat={this.state.flagLat}
                      flagLong={this.state.flagLong}
                    />
                  )}
                  {this.state.flagCaptured && (
                    <MapView.Circle
                      center={{
                        latitude: this.state.zoneLat,
                        longitude: this.state.zoneLong
                      }}
                      radius={20}
                      fillColor="rgba(0, 255, 0, 0.3)"
                      strokeColor="rgba(0, 255, 0, 0.3)"
                    />
                  )}
                </MapView>
                <TouchableHighlight
                  onPress={this.handleRecenter}
                  underlayColor={"#ececec"}
                  style={styles.recenterBtn}
                >
                  <FontAwesome name="crosshairs" size={40} style={styles.recenterBtnIcon} />
                </TouchableHighlight>
              </View>
            </Drawer>
          </Drawer>
        </View>
      );
    }
  }
}


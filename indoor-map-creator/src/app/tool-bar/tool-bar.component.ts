import {
  Component, OnInit, Input, Output, EventEmitter, ChangeDetectorRef,
  ViewChild, ElementRef, AfterContentInit, HostBinding, NgZone
} from '@angular/core';
import { GoogleMapsAPIWrapper } from '@agm/core';
import { Polyline } from "@agm/core/services/google-maps-types";
import { Router } from '@angular/router';
import { FeatureService } from "../services/feature.service";
import { Feature } from '../models/feature.model';
import { Building } from '../models/building.model';
import { UUID } from 'angular2-uuid';
declare var google: any;

// drawing tools
@Component({
  selector: 'app-tool-bar',
  templateUrl: './tool-bar.component.html',
  styleUrls: ['./tool-bar.component.css'],
  providers: [GoogleMapsAPIWrapper]
})
export class ToolBarComponent implements OnInit {
  @Input() map: any;
  @Input('mapApi') mapApi: GoogleMapsAPIWrapper;
  _selectedLevels = [];
  @Input() set selectedLevels(value) {
    this._selectedLevels = value;
    this.hideFeatures(this.selectedLevels);
  }
  get selectedLevels() {
    return this._selectedLevels;
  }
  // polygon
  drawButtonsEnabled = true;
  canChangeFeatureSelection = true;
  private featureCollection = [];
  private activePolygon?: any;
  private activePolyLine?: any;
  private activePoint?: any;
  private highLightedFeature: any;
  private isDrawingMode = false;
  private _onMapClickListener: any;
  private _onMapRightClickListner: any;
  private currentGeometryType: string = 'none';
  private featureOptionsOnDrawing = { editable: true, draggable: true, strokeWeight: 2, strokeColor: "black" };
  private featureOptionsOnHihglighted = { editable: true, draggable: true, strokeWeight: 2, strokeColor: "red" };
  private featureOptionsOnNotHighlighted = { editable: false, draggable: false, strokeWeight: 2, strokeColor: "black" };

  constructor(private _chRef: ChangeDetectorRef, private router: Router, private zone: NgZone, private featureService: FeatureService) {

  }

  ngOnInit() {
  }

  // handle map click
  private onMapClick = (e): void => {
    console.log('clicked');
    if (this.isDrawingMode) {
      if (this.currentGeometryType == "point") {
        this.drawPoint(e);
      } else if (this.currentGeometryType == 'area') {
        this.activePolygon.getPath().push(e.latLng);
      } else if (this.currentGeometryType == 'line') {
        this.activePolyLine.getPath().push(e.latLng);
      }
    } else {
      // Map events runs out of the Angular 2 zone.
      // Therefore it is neccessary to use the NgZone.run()
      // See: https://goo.gl/MzcPwQ

      this.zone.run(() => {
        this.router.navigateByUrl("/").then(
          (success) => {
            if (success || success == null) {
              this.clearHighlighting();
              this.hideFeatures(this.selectedLevels);
            }
          }
        );
      });
    }
  }

  // handle map right click
  private onMapRightClick = (e): void => {
    console.log('Right click');
    this.finishDrawing();
  }

  // handle draw area button
  onDrawPolygonClick() {
    // navigate and check if navigation success
    this.router.navigateByUrl("/").then(
      (success) => {
        if (success || success == null) {
          if (!this._onMapClickListener) {
            this._onMapClickListener = this.map.addListener('click', this.onMapClick);
          }
          this.currentGeometryType = 'area';
          this.isDrawingMode = true;
          this.drawPolygon();
          this.makeFeaturesClickable(false);
          this.drawButtonsEnabled = false;
          this.clearHighlighting();
        }
      });
  }

  // handle draw line button
  onDrawLineClick() {
    this.router.navigateByUrl("/").then(
      (success) => {
        if (success || success == null) {
          if (!this._onMapClickListener) {
            this._onMapClickListener = this.map.addListener('click', this.onMapClick);
          }
          this.currentGeometryType = 'line';
          this.isDrawingMode = true;
          this.drawPolyline();
          this.makeFeaturesClickable(false);
          this.drawButtonsEnabled = false;
          this.clearHighlighting();
        }
      });
  }

  // handle draw point button
  onDrawPointClick() {
    this.router.navigateByUrl("/").then(
      (success) => {
        if (success || success == null) {
          if (!this._onMapClickListener) {
            this._onMapClickListener = this.map.addListener('click', this.onMapClick);
          }
          this.currentGeometryType = 'point';
          this.isDrawingMode = true;
          this._onMapClickListener = this.map.addListener('click', this.onMapClick);
          this._onMapRightClickListner = this.map.addListener('rightclick', this.onMapRightClick)
          this.makeFeaturesClickable(false);
          this.drawButtonsEnabled = false;
          this.clearHighlighting();
        }
      });
  }

  finishDrawing() {
    var saveResult = true;
    var refId;
    if (this.currentGeometryType == 'line') {
      refId = this.activePolyLine.refId;
      saveResult = this.savePolyline();
    } else if (this.currentGeometryType == 'area') {
      refId = this.activePolygon.refId;
      saveResult = this.savePolygon();
    } else if (this.currentGeometryType == 'point') {
      refId = this.activePoint.refId;
      saveResult = this.savePoint();
    }
    if (saveResult) {
      this.isDrawingMode = false;
      this.zone.run(() => {
        // change route navigation
        this.router.navigateByUrl("/select-feature/" + this.currentGeometryType + "/" + refId).then(
          (success) => {
            //
          });
      });
      this.makeFeaturesClickable(true);
      this.drawButtonsEnabled = true;
    }
  }

  featureClickHandler(feature, geomType) {
    var refId = feature.refId;
    if (feature.hasOwnProperty('featureType') && feature.featureType != null) {
      this.zone.run(() => {
        this.router.navigateByUrl("/edit-tags/" + refId).then(
          (success) => {
            if (success || success == null) {
              this.clearHighlighting();
              this.highlightFeature(feature);
              this.highLightedFeature = feature;
            }
          }
        );
      });
    } else {
      this.zone.run(() => {
        this.router.navigateByUrl("/select-feature/" + geomType + "/" + refId).then(
          (success) => {
            if (success || success == null) {
              this.clearHighlighting();
              this.highlightFeature(feature);
              this.highLightedFeature = feature;
            }
          }
        );
      });
    }
  }

  clearHighlighting() {
    if (this.highLightedFeature) {
      this.highLightedFeature.setOptions(this.featureOptionsOnNotHighlighted);
      this.highLightedFeature.set('icon', '/assets/images/point.png'); //for points
    }
  }

  highlightFeature(feature) {
    feature.setOptions(this.featureOptionsOnHihglighted);
    feature.set('icon', '/assets/images/point-highlighted.png'); //for points
  }

  makeFeaturesClickable(flag) {
    this.featureService.observableList.subscribe(
      items => {
        items.forEach((item) => {
          item.geometry.set('clickable', flag);
        });
      });
    // this.featureCollection.forEach((item) => {
    //   item.feature.set('clickable', flag);
    // });
  }

  // draw polygon
  drawPolygon() {
    if (this.activePolygon == undefined || this.activePolygon == null) {
      this._onMapRightClickListner = this.map.addListener('rightclick', this.onMapRightClick);
      // create a polygon
      this.mapApi.createPolygon(this.featureOptionsOnDrawing).
        then(p => {
          console.log('polygon created');
          this.activePolygon = p;
          this.activePolygon.refId = UUID.UUID();
          // add click listner for the polygon
          p.addListener('click', (e) => {
            if (!this.isDrawingMode) {
              this.featureClickHandler(p, 'area');
            }
          });
        });
    }
  }

  savePolygon() {
    if (this.activePolygon && this.activePolygon != null && this.activePolygon.getPath().length > 2) {
      // this.featureCollection.push({ refId: UUID.UUID(), feature: this.activePolygon });
      this.featureService.add({
        refId: this.activePolygon.refId, geomType: 'polygon',
        geometry: this.activePolygon, feature: null
      });
      // then you need to dispose used objects
      this.disposeSomeObjects();
      return true;
    }
    return false;
  }

  // draw polygon
  drawPolyline() {
    if (this.activePolyLine == undefined || this.activePolyLine == null) {
      this._onMapRightClickListner = this.map.addListener('rightclick', this.onMapRightClick);
      // create a polyline
      this.mapApi.createPolyline(this.featureOptionsOnDrawing).
        then(p => {
          console.log('polyline created');
          this.activePolyLine = p;
          this.activePolyLine.refId = UUID.UUID();
          // add click listner for the polygon
          p.addListener('click', (e) => {
            if (!this.isDrawingMode) {
              this.clearHighlighting();
              this.featureClickHandler(p, 'line');
            }
          });
        });
    }
  }

  savePolyline() {
    if (this.activePolyLine && this.activePolyLine != null && this.activePolyLine.getPath().length > 1) {
      // this.featureCollection.push({ refId: UUID.UUID(), feature: this.activePolyLine });
      this.featureService.add({
        refId: this.activePolyLine.refId, geomType: 'line',
        geometry: this.activePolyLine, feature: null
      });
      // then you need to dispose used objects
      this.disposeSomeObjects();
      return true;
    }
    return false;
  }

  drawPoint(e) {
    // draw marker
    if (!this.activePoint) {
      var marker = new google.maps.Marker({
        position: e.latLng,
        map: this.map,
        icon: '/assets/images/point-highlighted.png',
        draggable: true
      });
      marker.addListener('click', (e) => {
        if (!this.isDrawingMode) {
          this.clearHighlighting();
          this.featureClickHandler(marker, 'point');
        }
      });
      this.activePoint = marker;
      this.activePoint.refId = UUID.UUID();
    }
  }

  savePoint() {
    if (this.activePoint) {
      // this.featureCollection.push({ refId: UUID.UUID(), feature: this.activePoint });
      this.featureService.add({
        refId: this.activePoint.refId, geomType: 'line',
        geometry: this.activePoint, feature: null
      });
      this.disposeSomeObjects();
      return true;
    } else {
      return false;
    }
  }
  private disposeSomeObjects() {
    if (this.activePolygon) {
      this.highLightedFeature = this.activePolygon;
      this.highLightedFeature.setOptions(this.featureOptionsOnHihglighted);
      this.activePolygon = null;
    }
    if (this.activePolyLine) {
      this.highLightedFeature = this.activePolyLine;
      this.highLightedFeature.setOptions(this.featureOptionsOnHihglighted);
      this.activePolyLine = null;
    }
    if (this.activePoint) {
      this.highLightedFeature = this.activePoint;
      this.highLightedFeature.setOptions(this.featureOptionsOnHihglighted);
      this.highLightedFeature.set('icon', '/assets/images/point.png');
      this.activePoint = null;
    }
    if (this._onMapRightClickListner) {
      this._onMapRightClickListner.remove();
    }
  }

  hideFeatures(levels: any[]) {
    this.featureService.observableList.subscribe(
      items => {
        items.forEach((item) => {
          if (item.geometry.level) {
            var level = item.geometry.level.toString();
            if (level) {
              if (levels && levels.length > 0) {
                if (!levels.includes(level)) {
                  item.geometry.setOptions({ visible: false });
                } else {
                  item.geometry.setOptions({ visible: true });
                }
              } else {
                item.geometry.setOptions({ visible: true });
              }
            }
          }
        });
      });
  }
}
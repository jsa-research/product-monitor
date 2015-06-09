var Component = false;

// Component requires jQuery for AJAX calls to data-source-url's defined on components
$(function() {
  Component = (function() {

    var Class = function() { }

    Class.create = function(elementName) {

      var ComponentClass = function(element) {
        this.element = element;
        this.template = document.getElementById(this.templateName);
        this.content = element.innerHTML;

        if(!this.template) {
          console.log("Could not find template for " + this.templateName);
          this.template = document.createElement("template");
          this.template.innerHTML = "{{content}}";
        }

        this.copyAttributes();
        this.init();
        this.refresh();
      }

      ComponentClass.prototype.elementName = elementName;
      ComponentClass.prototype.templateName = elementName + '-template';

      ComponentClass.prototype.copyAttributes = function() {
        var element = this.element;
        for(var i=0; i < element.attributes.length; i++) {
          var attribute = element.attributes[i];
          this[attribute.name] = attribute.value;
        }
      }

      ComponentClass.prototype.init = function() {
        // Reload any data if applicable
        this.render();
      }

      ComponentClass.prototype.preRenderStep = function() {
        // roll your own
      }

      ComponentClass.prototype.refreshTimeSeconds = 0;
      ComponentClass.refreshTime = function(seconds) {
        ComponentClass.prototype.refreshTimeSeconds = seconds;
        return ComponentClass;
      }

      ComponentClass.prototype.dataSourceTemplate = false;
      ComponentClass.dataSource = function(dataSourceTemplate) {
        ComponentClass.prototype.dataSourceTemplate = dataSourceTemplate;
        return ComponentClass;
      }

      ComponentClass.prototype.requestDataFromSource = function() {
        var self = this;

        this.dataSourceTemplate = this.dataSourceTemplate || this["data-source-template"] || false;
        this.dataSourceUrl = this["data-source-url"] || ComponentClass.expandTemplate(this, this.dataSourceTemplate);
        this.dataSourceDataType = this["data-source-type"] || "jsonp";
        this.dataSourceData = false;
        this.dataSourceError = false;

        if(!this.dataSourceUrl) {
          return false;
        }

        this.reportDataSourceStatus('Waiting for server response');

        $.ajax({
          url: this.dataSourceUrl,
          dataType: this.dataSourceDataType,
          success: function(data, textStatus) {
            self.dataSourceData = JSON.stringify(data);
            if(data !== null && typeof data === 'object') {
              for(var property in data) {
                self[property] = data[property];
              }
              if(data.error) {
                self.dataSourceError = data.error;
                self.reportDataSourceStatus("Error checking url: " + self.dataSourceUrl + " : " + JSON.stringify(data.error));
              }
              else {
                self.reportDataSourceStatus("Server responded OK.");
              }
            }
            else {
              self.reportDataSourceStatus(self.dataSourceUrl + " : Endpoint returned unexpected data : " + JSON.stringify(data));
            }
          }
        }).fail(function() {
          self.dataSourceError = true;
          self.reportDataSourceStatus(self.dataSourceUrl + " : Endpoint failed to return any kind of data.");
        });
      }

      ComponentClass.prototype.reportDataSourceStatus = function(message) {
        // console.log(this.element.tagName + ", " + message);
        this.dataSourceStatus = message;
        this.render();
      }

      ComponentClass.prototype.render = function() {
        this.preRenderStep();

        var expandedTemplate = document.createElement("template");
        expandedTemplate.innerHTML = ComponentClass.expandTemplate(this, this.template.innerHTML);

        this.element.innerHTML = expandedTemplate.innerHTML;
      }

      ComponentClass.expandTemplate = function(data, template) {
        var expandedTemplate = template;

        expandedTemplate = ComponentClass.expandProperty("content", data.content, expandedTemplate);

        for(var property in data) {
          expandedTemplate = ComponentClass.expandProperty(property, data[property], expandedTemplate);
        }

        return expandedTemplate;
      }

      ComponentClass.expandProperty = function(property, value, template) {
        var expandedTemplate = template;

        if(expandedTemplate) {
          var matcher = new RegExp("{{x}}".replace("x", property), "g");
          expandedTemplate = expandedTemplate.replace(matcher, value);
        }

        return expandedTemplate;
      }

      ComponentClass.prototype.refresh = function() {
        // Prevent timeout leaks
        if(this.refreshTimeoutId) {
          clearTimeout(this.refreshTimeoutId);
        }

        // loop
        var self = this;
        if(this.refreshTimeSeconds) {
          this.refreshTimeoutId = setTimeout(function() {
            self.refresh();
          }, this.refreshTimeSeconds * 1000 + Math.random() * 500);
        }

        // Re-load data for the component
        this.requestDataFromSource();
      }

      // Scan the document for components
      ComponentClass.setup = function() {
        var elements = document.getElementsByTagName(elementName);
        for(var i=0; i<elements.length; i++) {
          var element = elements[i];
          new ComponentClass(element);
        }
      }

      return ComponentClass;
    }

    return Class;
  })();

  Component.create('component').setup();
});